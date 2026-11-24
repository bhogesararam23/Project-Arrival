#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <algorithm>
#include <sstream>
#include <iomanip>

namespace arrival::algorithms {

struct EntityRecord {
    std::string id;
    std::string source_key;
    std::string name;
    std::string normalized_name;
    std::string address;
    std::string postal_code;
    std::string country_code;
    double latitude;
    double longitude;
};

struct PairScoreResult {
    std::string id_a;
    std::string id_b;
    double name_similarity;
    double address_similarity;
    double geo_proximity;
    double composite_score;
    double distance_meters;
    bool is_hard_negative;
};

struct BenchmarkMetrics {
    size_t total_pairs_evaluated;
    size_t candidate_pairs_blocked;
    size_t true_positives;
    size_t false_positives;
    size_t false_negatives;
    size_t true_negatives;
    double precision;
    double recall;
    double f1_score;
    double false_merge_rate; // Critical: false positives / (false positives + true negatives)
    double blocking_reduction_ratio;
    double elapsed_milliseconds;
    double pairs_per_second;
};

class EntityResolutionEngine {
public:
    static double jaro_winkler_similarity(const std::string& s1, const std::string& s2);
    static int levenshtein_distance(const std::string& s1, const std::string& s2);
    static double token_jaccard_similarity(const std::string& s1, const std::string& s2);
    static double haversine_distance_meters(double lat1, double lon1, double lat2, double lon2);

    static PairScoreResult score_pair(const EntityRecord& a, const EntityRecord& b);

    // Multi-pass blocking: spatial cell + country + name token
    static std::vector<std::pair<size_t, size_t>> generate_blocked_pairs(const std::vector<EntityRecord>& records);

    static BenchmarkMetrics evaluate_pairs(
        const std::vector<EntityRecord>& records,
        const std::unordered_set<std::string>& ground_truth_matches,
        const std::unordered_set<std::string>& known_hard_negatives,
        double auto_merge_threshold = 0.85
    );
};

} // namespace arrival::algorithms
