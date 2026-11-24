use crate::license::{AllowedPurpose, SourceRegistryEntry};
use crate::normalizer::Normalizer;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSourceRecord {
    pub source_key: String,
    pub external_id: String,
    pub raw_name: String,
    pub country_code: String,
    pub address_line: String,
    pub postal_code: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizedIngestionRecord {
    pub source_key: String,
    pub external_id: String,
    pub normalized_name: String,
    pub country_code: String,
    pub normalized_postal_code: String,
    pub geo_cell: String,
    pub latitude: f64,
    pub longitude: f64,
    pub payload_digest_hex: String,
    pub ingested_at: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum IngestionError {
    UnregisteredSource(String),
    SourceInactive(String),
    PurposeNotAllowed,
    InvalidCoordinates,
    InvalidCountryCode,
}

pub struct IngestionPipeline {
    normalizer: Normalizer,
    source_registry: Vec<SourceRegistryEntry>,
}

impl IngestionPipeline {
    pub fn new(sources: Vec<SourceRegistryEntry>) -> Self {
        Self {
            normalizer: Normalizer::new(),
            source_registry: sources,
        }
    }

    pub fn process_record(
        &self,
        record: RawSourceRecord,
        requested_purpose: AllowedPurpose,
    ) -> Result<NormalizedIngestionRecord, IngestionError> {
        // 1. License & Purpose Check
        let source = self
            .source_registry
            .iter()
            .find(|s| s.source_key == record.source_key)
            .ok_or_else(|| IngestionError::UnregisteredSource(record.source_key.clone()))?;

        if !source.active {
            return Err(IngestionError::SourceInactive(record.source_key.clone()));
        }

        if !source.is_purpose_permitted(&requested_purpose) {
            return Err(IngestionError::PurposeNotAllowed);
        }

        // 2. Coordinate sanity check
        if !(-90.0..=90.0).contains(&record.latitude) || !(-180.0..=180.0).contains(&record.longitude) {
            return Err(IngestionError::InvalidCoordinates);
        }

        // 3. Country code check
        if record.country_code.len() != 2 || !record.country_code.chars().all(|c| c.is_ascii_uppercase()) {
            return Err(IngestionError::InvalidCountryCode);
        }

        // 4. Normalization
        let normalized_name = self.normalizer.normalize_name(&record.raw_name);
        let normalized_postal_code = self.normalizer.normalize_postal_code(&record.postal_code);
        let geo_cell = self.normalizer.geo_blocking_cell(record.latitude, record.longitude);

        // 5. Payload hash
        let digest_input = format!(
            "{}:{}:{}:{}",
            record.source_key, record.external_id, normalized_name, normalized_postal_code
        );
        let mut hasher = Sha256::new();
        hasher.update(digest_input.as_bytes());
        let payload_digest_hex = hex::encode(hasher.finalize());

        Ok(NormalizedIngestionRecord {
            source_key: record.source_key,
            external_id: record.external_id,
            normalized_name,
            country_code: record.country_code,
            normalized_postal_code,
            geo_cell,
            latitude: record.latitude,
            longitude: record.longitude,
            payload_digest_hex,
            ingested_at: Utc::now().to_rfc3339(),
        })
    }
}
