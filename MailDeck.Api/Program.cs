using Amazon.KeyManagementService;
using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using MailDeck.Api.Middleware;
using MailDeck.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Enrichers.Span;
using Serilog.Events;
using Serilog.Formatting.Compact;
using ShuitNet.ORM;
using ShuitNet.ORM.PostgreSQL;
using System.Text;

// Register CodePages encoding provider for legacy encodings (ISO-2022-JP, Shift_JIS, etc.)
// This is required for handling Japanese and other non-UTF8 email encodings
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

// Configure Npgsql to handle DateTime with UTC properly
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
PostgreSqlConnect.NamingCase = NamingCase.SnakeCase;

dotenv.net.DotEnv.Load();

#region Initialize Serilog
// Configure Serilog Global Logger
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()           // LogContextから情報を取得
    .Enrich.WithSpan()                 // TraceId、SpanIdを自動追加
    .Enrich.WithMachineName()          // マシン名を追加
    .Enrich.WithEnvironmentName()      // 環境名（Development/Production）を追加
    .Enrich.WithProperty("Application", "MailDeck.Api")
    .Enrich.WithProperty("Version", "1.0.0")
    // コンソール出力（開発時のみ）
    .WriteTo.Console()
    // リクエストログ専用ファイル（Fluent Bit用JSON形式）
    .WriteTo.Logger(lc => lc
        .Filter.ByIncludingOnly(evt =>
            evt.Properties.ContainsKey("SourceContext") &&
            evt.Properties["SourceContext"].ToString().Contains("RequestLoggingMiddleware"))
        .WriteTo.File(
            new CompactJsonFormatter(),
            path: "logs/requests-.json",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            buffered: false))
    // パフォーマンスログ専用ファイル（Fluent Bit用JSON形式）
    .WriteTo.Logger(lc => lc
        .Filter.ByIncludingOnly(evt =>
            evt.Properties.ContainsKey("SourceContext") &&
            evt.Properties["SourceContext"].ToString().Contains("PerformanceLoggingMiddleware"))
        .WriteTo.File(
            new CompactJsonFormatter(),
            path: "logs/performance-.json",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            buffered: false))
    // 操作パフォーマンスログ専用ファイル（IMAP/SMTP操作計測用）
    .WriteTo.Logger(lc => lc
        .Filter.ByIncludingOnly(evt =>
            evt.Properties.ContainsKey("SourceContext") &&
            evt.Properties["SourceContext"].ToString().Contains("OperationPerformanceLogger"))
        .WriteTo.File(
            new CompactJsonFormatter(),
            path: "logs/operations-.json",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            buffered: false))
    // アプリケーションログファイル（Fluent Bit用JSON形式）
    .WriteTo.Logger(lc => lc
        .Filter.ByExcluding(evt =>
            evt.Properties.ContainsKey("SourceContext") &&
            (evt.Properties["SourceContext"].ToString().Contains("RequestLoggingMiddleware") ||
                evt.Properties["SourceContext"].ToString().Contains("PerformanceLoggingMiddleware") ||
                evt.Properties["SourceContext"].ToString().Contains("OperationPerformanceLogger")))
        .WriteTo.File(
            new CompactJsonFormatter(),
            path: "logs/maildeck-.json",
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 7,
            buffered: false))
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .MinimumLevel.Override("System", LogEventLevel.Warning)
    .CreateLogger();
#endregion

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Use Host Serilog
    builder.Host.UseSerilog();


    // Add services to the container.
    builder.Services.AddControllers();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "JWT Auth Bearer Scheme",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            Reference = new OpenApiReference
            {
                Type = ReferenceType.SecurityScheme,
                Id = "Bearer"
            }
        });
        options.AddSecurityRequirement(new OpenApiSecurityRequirement
                    {
                        {
                            new OpenApiSecurityScheme
                            {
                                Description = "JWT Auth Bearer Scheme",
                                Name = "Authorization",
                                In = ParameterLocation.Header,
                                Type = SecuritySchemeType.Http,
                                Scheme = "bearer",
                                Reference = new OpenApiReference
                                {
                                    Type = ReferenceType.SecurityScheme,
                                    Id = "Bearer"
                                }
                            }, new string[] { "Bearer" }
                        }
                    });
    });

    // AWS Cognito Authentication
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // Authority will be set in appsettings.json: https://cognito-idp.{region}.amazonaws.com/{userPoolId}
            options.Authority = builder.Configuration["Authentication:Cognito:Authority"];
            options.Audience = builder.Configuration["Authentication:Cognito:ClientId"];
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                NameClaimType = "sub", // Cognito の sub クレーム
                RoleClaimType = "cognito:groups" // Cognito Groups
            };
        });

    // CORS configuration
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy.WithOrigins(builder.Configuration["Frontend:Url"] ?? "http://localhost:5173")
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
            policy.WithOrigins("https://maildeck.shuit.net")
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        });
    });

    // Configure ShuitNet.ORM
    builder.Services.AddScoped<PostgreSqlConnect>(sp => 
        new PostgreSqlConnect(builder.Configuration["DefaultConnection"]!));

    // Register AWS Service
    builder.Services.AddDefaultAWSOptions(builder.Configuration.GetAWSOptions());
    builder.Services.AddAWSService<IAmazonKeyManagementService>();
    builder.Services.AddSingleton<IEncryptionService, KmsEncryptionService>();

    // Channel Service for auto-labeling
    builder.Services.AddSingleton<ChannelService>();

    // Auto-labeling Service
    builder.Services.AddHostedService<AutoLabelingService>();

    builder.Services.AddHostedService<EmailCheckBackgroundService>();

    // Log Compression
    builder.Services.AddHostedService<LogCompressionBackgroundService>();

    // Firebase Messaging
    FirebaseApp.Create(new AppOptions()
    {
        Credential = GoogleCredential.FromFile(
            builder.Configuration["Firebase:ServiceAccountKeyPath"]!
        ),
    });
    builder.Services.AddSingleton<FirebaseMessaging>(FirebaseMessaging.DefaultInstance);

    // エラーハンドリングの設定
    DatabaseErrorHelper.Configure(
        builder.Environment
    );
    // systemd との連携を有効化
    builder.Host.UseSystemd();

    var app = builder.Build();

    app.UseMiddleware<RequestLoggingMiddleware>();
    app.UseMiddleware<PerformanceLoggingMiddleware>();
    app.UseMiddleware<TokenLoggingMiddleware>();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    //app.UseHttpsRedirection();
    app.UseCors("AllowFrontend");
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapControllers();

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
