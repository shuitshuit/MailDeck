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
