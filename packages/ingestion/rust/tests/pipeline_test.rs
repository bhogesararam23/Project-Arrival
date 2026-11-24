use arrival_ingestion::*;
use chrono::{Duration, Utc};

#[test]
fn test_license_purpose_verification() {
    let source = SourceRegistryEntry {
        source_key: "open_feed".to_string(),
        source_name: "Open Feed".to_string(),
        terms_url: "https://example.com".to_string(),
        license_name: "ODbL".to_string(),
        allowed_purposes: vec![AllowedPurpose::DiscoverySearch],
        max_retention_days: 30,
        active: true,
    };

    let pipeline = IngestionPipeline::new(vec![source]);

    let valid_record = RawSourceRecord {
        source_key: "open_feed".to_string(),
        external_id: "ext-1".to_string(),
        raw_name: "Great Taste Pizzeria Inc.".to_string(),
        country_code: "GB".to_string(),
        address_line: "10 High St".to_string(),
        postal_code: "E1 6AN".to_string(),
        latitude: 51.5200,
        longitude: -0.0750,
        observed_at: None,
    };

    // Allowed purpose succeeds
    let res = pipeline.process_record(valid_record.clone(), AllowedPurpose::DiscoverySearch);
    assert!(res.is_ok());
    let normalized = res.unwrap();
    expect_cleaned_name(&normalized.normalized_name);

    // Disallowed purpose fails with PurposeNotAllowed
    let res_disallowed =
        pipeline.process_record(valid_record, AllowedPurpose::MerchantVerification);
    assert_eq!(res_disallowed, Err(IngestionError::PurposeNotAllowed));
}

fn expect_cleaned_name(name: &str) {
    assert_eq!(name, "great taste pizzeria");
}

#[test]
fn test_invalid_coordinates_rejected() {
    let source = SourceRegistryEntry {
        source_key: "open_feed".to_string(),
        source_name: "Open Feed".to_string(),
        terms_url: "https://example.com".to_string(),
        license_name: "ODbL".to_string(),
        allowed_purposes: vec![AllowedPurpose::DiscoverySearch],
        max_retention_days: 30,
        active: true,
    };

    let pipeline = IngestionPipeline::new(vec![source]);

    let invalid_coord = RawSourceRecord {
        source_key: "open_feed".to_string(),
        external_id: "ext-bad-geo".to_string(),
        raw_name: "Sky Restaurant".to_string(),
        country_code: "GB".to_string(),
        address_line: "Space".to_string(),
        postal_code: "NONE".to_string(),
        latitude: 95.0, // Invalid latitude (> 90)
        longitude: 0.0,
        observed_at: None,
    };

    let res = pipeline.process_record(invalid_coord, AllowedPurpose::DiscoverySearch);
    assert_eq!(res, Err(IngestionError::InvalidCoordinates));
}

#[test]
fn test_retention_period_enforcement() {
    let source = SourceRegistryEntry {
        source_key: "retention_feed".to_string(),
        source_name: "Retention Feed".to_string(),
        terms_url: "https://example.com/terms".to_string(),
        license_name: "Proprietary".to_string(),
        allowed_purposes: vec![AllowedPurpose::DiscoverySearch],
        max_retention_days: 30,
        active: true,
    };

    let pipeline = IngestionPipeline::new(vec![source]);

    // 1. Fresh record (5 days old) passes retention check
    let fresh_time = (Utc::now() - Duration::days(5)).to_rfc3339();
    let fresh_record = RawSourceRecord {
        source_key: "retention_feed".to_string(),
        external_id: "rec-fresh".to_string(),
        raw_name: "Fresh Bistro".to_string(),
        country_code: "GB".to_string(),
        address_line: "12 Fresh Lane".to_string(),
        postal_code: "SW1A 1AA".to_string(),
        latitude: 51.5000,
        longitude: -0.1200,
        observed_at: Some(fresh_time),
    };
    let fresh_res = pipeline.process_record(fresh_record, AllowedPurpose::DiscoverySearch);
    assert!(fresh_res.is_ok());

    // 2. Expired record (45 days old when max is 30) must be rejected
    let stale_time = (Utc::now() - Duration::days(45)).to_rfc3339();
    let stale_record = RawSourceRecord {
        source_key: "retention_feed".to_string(),
        external_id: "rec-stale".to_string(),
        raw_name: "Old Bistro".to_string(),
        country_code: "GB".to_string(),
        address_line: "14 Old Lane".to_string(),
        postal_code: "SW1A 1AA".to_string(),
        latitude: 51.5000,
        longitude: -0.1200,
        observed_at: Some(stale_time),
    };
    let stale_res = pipeline.process_record(stale_record, AllowedPurpose::DiscoverySearch);
    assert_eq!(stale_res, Err(IngestionError::RetentionPeriodExceeded));

    // 3. Malformed timestamp must be rejected
    let malformed_record = RawSourceRecord {
        source_key: "retention_feed".to_string(),
        external_id: "rec-bad-ts".to_string(),
        raw_name: "Malformed TS Bistro".to_string(),
        country_code: "GB".to_string(),
        address_line: "16 Bad Lane".to_string(),
        postal_code: "SW1A 1AA".to_string(),
        latitude: 51.5000,
        longitude: -0.1200,
        observed_at: Some("invalid-rfc3339-timestamp".to_string()),
    };
    let malformed_res = pipeline.process_record(malformed_record, AllowedPurpose::DiscoverySearch);
    assert_eq!(malformed_res, Err(IngestionError::InvalidTimestamp));
}

#[test]
fn test_inactive_source_rejected() {
    let inactive_source = SourceRegistryEntry {
        source_key: "inactive_feed".to_string(),
        source_name: "Inactive Feed".to_string(),
        terms_url: "https://example.com/terms".to_string(),
        license_name: "Proprietary".to_string(),
        allowed_purposes: vec![AllowedPurpose::DiscoverySearch],
        max_retention_days: 90,
        active: false,
    };

    let pipeline = IngestionPipeline::new(vec![inactive_source]);

    let record = RawSourceRecord {
        source_key: "inactive_feed".to_string(),
        external_id: "rec-1".to_string(),
        raw_name: "Inactive Venue".to_string(),
        country_code: "GB".to_string(),
        address_line: "1 Inactive Road".to_string(),
        postal_code: "E1 6AN".to_string(),
        latitude: 51.5200,
        longitude: -0.0750,
        observed_at: None,
    };

    let res = pipeline.process_record(record, AllowedPurpose::DiscoverySearch);
    assert_eq!(
        res,
        Err(IngestionError::SourceInactive("inactive_feed".to_string()))
    );
}
