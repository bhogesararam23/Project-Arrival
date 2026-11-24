use arrival_ingestion::*;

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
    };

    let res = pipeline.process_record(invalid_coord, AllowedPurpose::DiscoverySearch);
    assert_eq!(res, Err(IngestionError::InvalidCoordinates));
}
