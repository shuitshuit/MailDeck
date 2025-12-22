using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Enrichers.Span;
using Serilog.Events;
using Serilog.Formatting.Compact;

// Configure Npgsql to handle DateTime with UTC properly
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

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
    // アプリケーションログファイル（Fluent Bit用JSON形式）
    .WriteTo.Logger(lc => lc
        .Filter.ByExcluding(evt =>
            evt.Properties.ContainsKey("SourceContext") &&
            (evt.Properties["SourceContext"].ToString().Contains("RequestLoggingMiddleware") ||
                evt.Properties["SourceContext"].ToString().Contains("PerformanceLoggingMiddleware")))
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
    builder.Services.AddSwaggerGen();

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
    builder.Services.AddScoped<ShuitNet.ORM.PostgreSQL.PostgreSqlConnect>(sp => 
        new ShuitNet.ORM.PostgreSQL.PostgreSqlConnect(builder.Configuration["DefaultConnection"]!));

    // Register AWS Service
    builder.Services.AddDefaultAWSOptions(builder.Configuration.GetAWSOptions());
    builder.Services.AddAWSService<Amazon.KeyManagementService.IAmazonKeyManagementService>();
    builder.Services.AddSingleton<MailDeck.Api.Services.IEncryptionService, MailDeck.Api.Services.KmsEncryptionService>();

    // Web Push
    builder.Services.AddHttpClient<Lib.Net.Http.WebPush.PushServiceClient>();
    builder.Services.AddHostedService<MailDeck.Api.Services.EmailCheckBackgroundService>();

    var app = builder.Build();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }
    app.UseMiddleware<MailDeck.Api.Middleware.TokenLoggingMiddleware>();

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
