namespace MailDeck.Api.Models.DTO.OAuth;

public class OAuthProvidersResponse
{
    /// <summary>True when the server has Google OAuth client credentials configured.</summary>
    public bool Google { get; set; }
}

public class OAuthAuthorizeRequest
{
    /// <summary>Set to re-authorize an existing account instead of adding a new one.</summary>
    public string? ConfigId { get; set; }

    /// <summary>Pre-selects an account on Google's consent screen.</summary>
    public string? LoginHint { get; set; }
}

public class OAuthAuthorizeResponse
{
    public string AuthorizationUrl { get; set; } = string.Empty;
}

public class GoogleIntegrationStatusResponse
{
    /// <summary>False when the server has no Google OAuth credentials; the UI hides the feature.</summary>
    public bool Available { get; set; }

    public bool Connected { get; set; }

    /// <summary>Google account the grant belongs to.</summary>
    public string? Email { get; set; }
}
