#include "entity_resolution.hpp"
#include <iostream>
#include <cassert>
#include <cmath>

using namespace arrival::algorithms;

void test_string_similarities() {
    // 1. Jaro-Winkler
    double s_identical = EntityResolutionEngine::jaro_winkler_similarity("martha", "martha");
    assert(std::abs(s_identical - 1.0) < 1e-6);
    (void)s_identical;

    double s_close = EntityResolutionEngine::jaro_winkler_similarity("martha", "marhta");
    assert(s_close > 0.94);
    (void)s_close;

    double s_diff = EntityResolutionEngine::jaro_winkler_similarity("pizza", "sushi");
    assert(s_diff < 0.5);
    (void)s_diff;

    // 2. Levenshtein
    assert(EntityResolutionEngine::levenshtein_distance("kitten", "sitting") == 3);
    assert(EntityResolutionEngine::levenshtein_distance("arrival", "arrival") == 0);

    // 3. Token Jaccard
    double jaccard_overlap = EntityResolutionEngine::token_jaccard_similarity("Westminster Artisan Bakery", "Westminster Bakery");
    assert(jaccard_overlap >= 0.66);
    (void)jaccard_overlap;

    std::cout << "[PASS] String similarity tests passed." << std::endl;
}

void test_haversine_distance() {
    // Distance between London Westminster and London Covent Garden is ~1.5km
    double dist = EntityResolutionEngine::haversine_distance_meters(51.4988, -0.1309, 51.5126, -0.1235);
    assert(dist > 1400.0 && dist < 1700.0);

    // Same point is 0
    double zero_dist = EntityResolutionEngine::haversine_distance_meters(51.5, -0.1, 51.5, -0.1);
    assert(zero_dist < 1e-4);
    (void)zero_dist;

    std::cout << "[PASS] Haversine distance tests passed (" << dist << " m)." << std::endl;
}

void test_pair_scoring_and_hard_negatives() {
    EntityRecord branch_a{
        "venue-001",
        "source-1",
        "Dishoom Covent Garden",
        "dishoom covent garden",
        "12 Upper St Martins Ln, London",
        "WC2H 9FB",
        "GB",
        51.5127,
        -0.1264
    };

    EntityRecord match_of_a{
        "venue-001-match",
        "source-2",
        "Dishoom - Covent Garden",
        "dishoom covent garden",
        "12 Upper St Martin's Lane",
        "WC2H 9FB",
        "GB",
        51.5128,
        -0.1263
    };

    EntityRecord different_branch_hard_neg{
        "venue-002-branch",
        "source-1",
        "Dishoom Shoreditch",
        "dishoom shoreditch",
        "7 Boundary St, London",
        "E2 7JE",
        "GB",
        51.5245,
        -0.0772
    };

    // 1. True match should score >= 0.85 (auto-merge threshold)
    auto match_res = EntityResolutionEngine::score_pair(branch_a, match_of_a);
    assert(match_res.composite_score >= 0.85);
    assert(!match_res.is_hard_negative);

    // 2. Different branch in same city (>2km) must be flagged as hard negative!
    auto hard_neg_res = EntityResolutionEngine::score_pair(branch_a, different_branch_hard_neg);
    assert(hard_neg_res.is_hard_negative);
    assert(hard_neg_res.composite_score == 0.0);

    std::cout << "[PASS] Pair scoring and hard negative disambiguation passed." << std::endl;
}

void test_spatial_boundary_and_subblocking() {
    // 1. Boundary recall across grid cell edges (e.g. lat 51.5049 vs 51.5051)
    EntityRecord rec1{
        "boundary-01",
        "src-1",
        "Boundary Cafe & Deli",
        "boundary cafe deli",
        "45 Boundary Rd, London",
        "NW8 0JE",
        "GB",
        51.5049,
        -0.1200
    };

    EntityRecord rec2{
        "boundary-02",
        "src-2",
        "The Boundary Cafe",
        "boundary cafe",
        "45 Boundary Road",
        "NW8 0JE",
        "GB",
        51.5051,
        -0.1201
    };

    int lat1 = static_cast<int>(std::round(rec1.latitude * 100.0));
    int lat2 = static_cast<int>(std::round(rec2.latitude * 100.0));
    assert(lat1 != lat2); // Must be in different primary cells
    (void)lat1;
    (void)lat2;

    std::vector<EntityRecord> records = {rec1, rec2};
    auto blocked_pairs = EntityResolutionEngine::generate_blocked_pairs(records);
    assert(!blocked_pairs.empty());
    assert(blocked_pairs[0].first == 0 && blocked_pairs[0].second == 1);

    // 2. Large block sub-blocking (120 records in same spatial cell)
    std::vector<EntityRecord> large_corpus;
    for (int i = 0; i < 120; ++i) {
        std::string pfx = (i < 60) ? "pizza" : "burger";
        large_corpus.push_back(EntityRecord{
            "venue-" + std::to_string(i),
            "src-1",
            pfx + " Place #" + std::to_string(i),
            pfx + " place " + std::to_string(i),
            std::to_string(i) + " High St",
            "W1D 1BS",
            "GB",
            51.5150,
            -0.1300
        });
    }

    auto large_pairs = EntityResolutionEngine::generate_blocked_pairs(large_corpus);
    assert(!large_pairs.empty()); // Must not silently drop large blocks

    // 3. Metric identity: TP + FP + FN + TN == Total Possible Pairs
    std::unordered_set<std::string> true_matches = {"boundary-01<->boundary-02"};
    std::unordered_set<std::string> hard_negs;
    auto metrics = EntityResolutionEngine::evaluate_pairs(records, true_matches, hard_negs, 0.85);

    assert(metrics.true_positives + metrics.false_positives +
           metrics.false_negatives + metrics.true_negatives == metrics.total_pairs_evaluated);
    assert(metrics.true_positives == 1);
    assert(metrics.false_negatives == 0);
    assert(metrics.precision == 1.0);
    assert(metrics.recall == 1.0);

    std::cout << "[PASS] Spatial boundary recall and sub-blocking tests passed." << std::endl;
}

int main() {
    std::cout << "Running C++ Entity Resolution Unit Tests..." << std::endl;
    test_string_similarities();
    test_haversine_distance();
    test_pair_scoring_and_hard_negatives();
    test_spatial_boundary_and_subblocking();
    std::cout << "All C++ tests PASSED successfully." << std::endl;
    return 0;
}
