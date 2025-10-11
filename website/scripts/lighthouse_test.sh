#!/bin/bash

###############################################################################
# Lighthouse Performance Testing Script
# Tests multiple pages and generates reports with threshold checks
###############################################################################

set -e

# Configuration
LIGHTHOUSE_CLI="npx lighthouse"
OUTPUT_DIR="lighthouse-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

# Thresholds (0-100)
PERFORMANCE_THRESHOLD=90
ACCESSIBILITY_THRESHOLD=95
BEST_PRACTICES_THRESHOLD=90
SEO_THRESHOLD=90

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Pages to test
declare -a PAGES=(
    "http://localhost:3000/:Home"
    "http://localhost:3000/pricing:Pricing"
    "http://localhost:3000/docs:API Docs"
)

###############################################################################
# Functions
###############################################################################

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

check_dependencies() {
    print_header "Checking Dependencies"

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js is installed"

    if ! command -v npx &> /dev/null; then
        print_error "npx is not installed"
        exit 1
    fi
    print_success "npx is available"

    # Check if lighthouse is available
    if ! npx lighthouse --version &> /dev/null; then
        print_warning "Lighthouse not found, installing..."
        npm install -g lighthouse
    fi
    print_success "Lighthouse is available"
}

check_server() {
    print_header "Checking Development Server"

    if ! curl -s http://localhost:3000 > /dev/null; then
        print_error "Development server is not running on http://localhost:3000"
        echo "Please start the server with: npm run dev"
        exit 1
    fi
    print_success "Development server is running"
}

create_report_dir() {
    mkdir -p "${REPORT_DIR}"
    print_success "Created report directory: ${REPORT_DIR}"
}

run_lighthouse() {
    local url=$1
    local name=$2
    local output_file="${REPORT_DIR}/${name// /-}"

    echo ""
    print_header "Testing: $name"
    echo "URL: $url"

    # Run Lighthouse
    $LIGHTHOUSE_CLI "$url" \
        --output html \
        --output json \
        --output-path "$output_file" \
        --chrome-flags="--headless --no-sandbox" \
        --quiet \
        || true

    # Check if reports were generated
    if [ -f "${output_file}.json" ]; then
        print_success "Report generated: ${output_file}.html"
        return 0
    else
        print_error "Failed to generate report for $name"
        return 1
    fi
}

check_thresholds() {
    local json_file=$1
    local name=$2

    if [ ! -f "$json_file" ]; then
        print_error "JSON report not found: $json_file"
        return 1
    fi

    # Extract scores using jq (or python if jq not available)
    if command -v jq &> /dev/null; then
        PERFORMANCE=$(jq '.categories.performance.score * 100' "$json_file")
        ACCESSIBILITY=$(jq '.categories.accessibility.score * 100' "$json_file")
        BEST_PRACTICES=$(jq '.categories["best-practices"].score * 100' "$json_file")
        SEO=$(jq '.categories.seo.score * 100' "$json_file")
    else
        # Fallback to python
        PERFORMANCE=$(python3 -c "import json; data=json.load(open('$json_file')); print(data['categories']['performance']['score'] * 100)")
        ACCESSIBILITY=$(python3 -c "import json; data=json.load(open('$json_file')); print(data['categories']['accessibility']['score'] * 100)")
        BEST_PRACTICES=$(python3 -c "import json; data=json.load(open('$json_file')); print(data['categories']['best-practices']['score'] * 100)")
        SEO=$(python3 -c "import json; data=json.load(open('$json_file')); print(data['categories']['seo']['score'] * 100)")
    fi

    # Round to integer
    PERFORMANCE=${PERFORMANCE%.*}
    ACCESSIBILITY=${ACCESSIBILITY%.*}
    BEST_PRACTICES=${BEST_PRACTICES%.*}
    SEO=${SEO%.*}

    echo ""
    echo "Scores for $name:"
    echo "  Performance:    $PERFORMANCE / $PERFORMANCE_THRESHOLD"
    echo "  Accessibility:  $ACCESSIBILITY / $ACCESSIBILITY_THRESHOLD"
    echo "  Best Practices: $BEST_PRACTICES / $BEST_PRACTICES_THRESHOLD"
    echo "  SEO:            $SEO / $SEO_THRESHOLD"

    # Check thresholds
    local failed=0

    if [ "$PERFORMANCE" -lt "$PERFORMANCE_THRESHOLD" ]; then
        print_error "Performance score ($PERFORMANCE) is below threshold ($PERFORMANCE_THRESHOLD)"
        failed=1
    else
        print_success "Performance score passed"
    fi

    if [ "$ACCESSIBILITY" -lt "$ACCESSIBILITY_THRESHOLD" ]; then
        print_error "Accessibility score ($ACCESSIBILITY) is below threshold ($ACCESSIBILITY_THRESHOLD)"
        failed=1
    else
        print_success "Accessibility score passed"
    fi

    if [ "$BEST_PRACTICES" -lt "$BEST_PRACTICES_THRESHOLD" ]; then
        print_error "Best Practices score ($BEST_PRACTICES) is below threshold ($BEST_PRACTICES_THRESHOLD)"
        failed=1
    else
        print_success "Best Practices score passed"
    fi

    if [ "$SEO" -lt "$SEO_THRESHOLD" ]; then
        print_error "SEO score ($SEO) is below threshold ($SEO_THRESHOLD)"
        failed=1
    else
        print_success "SEO score passed"
    fi

    return $failed
}

generate_summary() {
    print_header "Lighthouse Test Summary"

    echo "Report directory: ${REPORT_DIR}"
    echo ""
    echo "Open reports:"
    for page in "${PAGES[@]}"; do
        IFS=':' read -r url name <<< "$page"
        local file="${REPORT_DIR}/${name// /-}.html"
        if [ -f "$file" ]; then
            echo "  - file://${PWD}/${file}"
        fi
    done
}

###############################################################################
# Main Script
###############################################################################

main() {
    print_header "Lighthouse Performance Testing"
    echo "Starting Lighthouse tests..."
    echo ""

    # Preliminary checks
    check_dependencies
    check_server
    create_report_dir

    # Run tests
    local total_tests=0
    local failed_tests=0

    for page in "${PAGES[@]}"; do
        IFS=':' read -r url name <<< "$page"

        if run_lighthouse "$url" "$name"; then
            local output_file="${REPORT_DIR}/${name// /-}.json"

            if check_thresholds "$output_file" "$name"; then
                print_success "All thresholds passed for $name"
            else
                print_error "Some thresholds failed for $name"
                ((failed_tests++))
            fi
        else
            print_error "Lighthouse test failed for $name"
            ((failed_tests++))
        fi

        ((total_tests++))
    done

    # Summary
    echo ""
    generate_summary

    echo ""
    if [ $failed_tests -eq 0 ]; then
        print_success "All Lighthouse tests passed! (${total_tests}/${total_tests})"
        exit 0
    else
        print_error "${failed_tests}/${total_tests} tests failed"
        exit 1
    fi
}

# Run main function
main "$@"
