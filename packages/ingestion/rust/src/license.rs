use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AllowedPurpose {
    DiscoverySearch,
    MerchantVerification,
    ServiceabilityCheck,
    InternalAnalytics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRegistryEntry {
    pub source_key: String,
    pub source_name: String,
    pub terms_url: String,
    pub license_name: String,
    pub allowed_purposes: Vec<AllowedPurpose>,
    pub max_retention_days: u32,
    pub active: bool,
}

impl SourceRegistryEntry {
    pub fn is_purpose_permitted(&self, purpose: &AllowedPurpose) -> bool {
        if !self.active {
            return false;
        }
        self.allowed_purposes.contains(purpose)
    }

    pub fn validate_retention(&self, age_days: u32) -> bool {
        age_days <= self.max_retention_days
    }
}
