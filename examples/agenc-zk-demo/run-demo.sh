#!/bin/bash
# KAMIYO x TETSUO - Agent-to-Agent ZK Trust Demo

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
NATIVE_DIR="$ROOT_DIR/native/tetsuo-core"

# Neon colors (magenta, purple, cyan only)
MAGENTA='\033[38;5;199m'
PURPLE='\033[38;5;129m'
CYAN='\033[38;5;51m'
PINK='\033[38;5;213m'
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

clear

echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${MAGENTA}║${RESET}                                                                                                                ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${MAGENTA}██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ${PURPLE}██╗  ██╗    ${CYAN}████████╗███████╗████████╗███████╗██╗   ██╗ ██████╗${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${MAGENTA}██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ${PURPLE}╚██╗██╔╝    ${CYAN}╚══██╔══╝██╔════╝╚══██╔══╝██╔════╝██║   ██║██╔═══██╗${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${PINK}█████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║     ${PURPLE}╚███╔╝        ${CYAN}██║   █████╗     ██║   ███████╗██║   ██║██║   ██║${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${PINK}██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║     ${PURPLE}██╔██╗        ${CYAN}██║   ██╔══╝     ██║   ╚════██║██║   ██║██║   ██║${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${PINK}██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ${PURPLE}██╔╝ ██╗       ${CYAN}██║   ███████╗   ██║   ███████║╚██████╔╝╚██████╔╝${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}   ${PINK}╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ${PURPLE}╚═╝  ╚═╝       ${CYAN}╚═╝   ╚══════╝   ╚═╝   ╚══════╝ ╚═════╝  ╚═════╝ ${RESET}   ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}║${RESET}                                                                                                                ${MAGENTA}║${RESET}"
echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "   ${BOLD}${PURPLE}◈${RESET}  ${CYAN}AGENT-TO-AGENT ZK TRUST${RESET}  ${BOLD}${PURPLE}◈${RESET}  ${MAGENTA}PRIVACY-PRESERVING REPUTATION${RESET}  ${BOLD}${PURPLE}◈${RESET}"
echo ""
echo -e "   ${DIM}Privacy-preserving reputation proofs for AI agent frameworks.${RESET}"
echo -e "   ${DIM}Groth16 proofs over BN254. Native C verification. AgenC compatible.${RESET}"
echo ""
echo -e "   ${PURPLE}─────────────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "   This demo shows:"
echo -e "     ${CYAN}1.${RESET} Native C library - Poseidon hashing, sub-millisecond verification"
echo -e "     ${CYAN}2.${RESET} TypeScript SDK - Real Groth16 proof generation"
echo ""
echo -e "   Press ${BOLD}Enter${RESET} to start..."
read

# Part 1: Native C demo
echo ""
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  PART 1: NATIVE C LIBRARY${RESET}"
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${DIM}Building native library...${RESET}"

cd "$NATIVE_DIR"
make static > /dev/null 2>&1

echo -e "  ${DIM}Compiling demo...${RESET}"
cd "$NATIVE_DIR/examples"
cc -O3 -I../src agent_trust_demo.c ../lib/libtetsuo.a -o agent_trust 2>/dev/null

echo -e "  ${CYAN}Running...${RESET}"
echo ""
./agent_trust

echo ""
echo -e "  Press ${BOLD}Enter${RESET} for TypeScript demo..."
read

# Part 2: TypeScript demo
echo ""
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  PART 2: TYPESCRIPT SDK (REAL GROTH16 PROOFS)${RESET}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════${RESET}"
echo ""

cd "$SCRIPT_DIR"
npm run demo 2>/dev/null

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Demo complete.${RESET}"
echo ""
echo -e "  ${MAGENTA}github.com/kamiyo-ai/kamiyo-protocol${RESET}  ${PURPLE}•${RESET}  ${CYAN}github.com/tetsuo-ai/AgenC${RESET}"
echo ""
