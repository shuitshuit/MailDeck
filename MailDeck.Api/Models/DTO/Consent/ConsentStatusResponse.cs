namespace MailDeck.Api.Models.DTO.Consent;

public class ConsentStatusResponse
{
    public bool TermsOfServiceConsented { get; set; }
    public string? TermsOfServiceConsentedVersion { get; set; }
    public DateTime? TermsOfServiceConsentedAt { get; set; }

    public bool PrivacyPolicyConsented { get; set; }
    public string? PrivacyPolicyConsentedVersion { get; set; }
    public DateTime? PrivacyPolicyConsentedAt { get; set; }

    public string LatestTermsOfServiceVersion { get; set; } = string.Empty;
    public string LatestPrivacyPolicyVersion { get; set; } = string.Empty;

    public bool RequiresTermsOfServiceConsent { get; set; }
    public bool RequiresPrivacyPolicyConsent { get; set; }
}
