// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SwarmSimulator
 * @notice Parallel evolutionary simulation engine for agent swarms.
 * @dev Leverages Monad's optimistic parallel execution for concurrent simulations.
 */
contract SwarmSimulator {
    struct Simulation {
        bytes32 configHash;
        uint256 totalRounds;
        uint256 currentRound;
        bytes32 stateRoot;
        bool completed;
        address initiator;
        uint256 startedAt;
        uint256 completedAt;
    }

    struct RoundState {
        bytes32 stateHash;
        uint256 gasUsed;
        uint256 timestamp;
    }

    // Simulation storage
    mapping(bytes32 => Simulation) public simulations;
    mapping(bytes32 => mapping(uint256 => RoundState)) public roundStates;
    mapping(bytes32 => bytes) public simulationResults;

    // Counters
    uint256 public totalSimulations;
    uint256 public activeSimulations;

    // Config
    uint256 public maxRounds = 1000;
    uint256 public maxConcurrentSimulations = 100;

    address public admin;

    event SimulationStarted(
        bytes32 indexed simId,
        bytes32 configHash,
        uint256 rounds,
        address initiator
    );
    event RoundCompleted(
        bytes32 indexed simId,
        uint256 round,
        bytes32 stateHash,
        uint256 gasUsed
    );
    event SimulationFinalized(
        bytes32 indexed simId,
        bytes results,
        uint256 duration
    );
    event ConfigUpdated(uint256 maxRounds, uint256 maxConcurrent);

    error SimulationNotFound();
    error SimulationCompleted();
    error SimulationNotCompleted();
    error InvalidRounds();
    error TooManySimulations();
    error RoundMismatch();
    error NotAdmin();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    /**
     * @notice Initialize a new simulation.
     * @param configHash Hash of the simulation configuration.
     * @param rounds Number of simulation rounds.
     * @return simId The simulation identifier.
     */
    function initializeSimulation(
        bytes32 configHash,
        uint256 rounds
    ) external returns (bytes32 simId) {
        if (rounds == 0 || rounds > maxRounds) revert InvalidRounds();
        if (activeSimulations >= maxConcurrentSimulations) {
            revert TooManySimulations();
        }

        simId = keccak256(
            abi.encodePacked(
                configHash,
                msg.sender,
                block.timestamp,
                totalSimulations
            )
        );

        simulations[simId] = Simulation({
            configHash: configHash,
            totalRounds: rounds,
            currentRound: 0,
            stateRoot: bytes32(0),
            completed: false,
            initiator: msg.sender,
            startedAt: block.timestamp,
            completedAt: 0
        });

        totalSimulations++;
        activeSimulations++;

        emit SimulationStarted(simId, configHash, rounds, msg.sender);
    }

    /**
     * @notice Execute a simulation round.
     * @dev Monad's parallel execution allows concurrent round processing.
     * @param simId The simulation identifier.
     * @param actions Encoded actions for this round.
     * @return stateHash The resulting state hash.
     */
    function executeRound(
        bytes32 simId,
        bytes calldata actions
    ) external returns (bytes32 stateHash) {
        Simulation storage sim = simulations[simId];
        if (sim.initiator == address(0)) revert SimulationNotFound();
        if (sim.completed) revert SimulationCompleted();

        uint256 round = sim.currentRound;
        uint256 gasStart = gasleft();

        // Compute state hash from actions and previous state
        bytes32 prevState = round == 0
            ? sim.configHash
            : roundStates[simId][round - 1].stateHash;

        stateHash = keccak256(abi.encodePacked(prevState, actions, round));

        uint256 gasUsed = gasStart - gasleft();

        roundStates[simId][round] = RoundState({
            stateHash: stateHash,
            gasUsed: gasUsed,
            timestamp: block.timestamp
        });

        sim.currentRound = round + 1;
        sim.stateRoot = stateHash;

        emit RoundCompleted(simId, round, stateHash, gasUsed);

        // Auto-finalize if all rounds complete
        if (sim.currentRound >= sim.totalRounds) {
            _finalize(simId);
        }
    }

    /**
     * @notice Execute multiple rounds in parallel.
     * @dev Leverages Monad's parallel execution for batch processing.
     */
    function executeRoundsBatch(
        bytes32 simId,
        bytes[] calldata actionsBatch
    ) external returns (bytes32[] memory stateHashes) {
        stateHashes = new bytes32[](actionsBatch.length);

        for (uint256 i = 0; i < actionsBatch.length; i++) {
            stateHashes[i] = this.executeRound(simId, actionsBatch[i]);
        }
    }

    /**
     * @notice Get current simulation state.
     */
    function getSimulationState(
        bytes32 simId
    )
        external
        view
        returns (bytes32 stateHash, uint256 currentRound, bool completed)
    {
        Simulation storage sim = simulations[simId];
        if (sim.initiator == address(0)) revert SimulationNotFound();
        return (sim.stateRoot, sim.currentRound, sim.completed);
    }

    /**
     * @notice Manually finalize simulation.
     */
    function finalizeSimulation(
        bytes32 simId
    ) external returns (bytes memory results) {
        Simulation storage sim = simulations[simId];
        if (sim.initiator == address(0)) revert SimulationNotFound();
        if (sim.completed) return simulationResults[simId];

        _finalize(simId);
        return simulationResults[simId];
    }

    /**
     * @notice Get simulation results.
     */
    function getResults(
        bytes32 simId
    ) external view returns (bytes memory) {
        Simulation storage sim = simulations[simId];
        if (!sim.completed) revert SimulationNotCompleted();
        return simulationResults[simId];
    }

    /**
     * @notice Get round state.
     */
    function getRoundState(
        bytes32 simId,
        uint256 round
    ) external view returns (RoundState memory) {
        return roundStates[simId][round];
    }

    /**
     * @notice Update configuration.
     */
    function setConfig(
        uint256 _maxRounds,
        uint256 _maxConcurrent
    ) external onlyAdmin {
        maxRounds = _maxRounds;
        maxConcurrentSimulations = _maxConcurrent;
        emit ConfigUpdated(_maxRounds, _maxConcurrent);
    }

    /**
     * @notice Internal finalization.
     */
    function _finalize(bytes32 simId) internal {
        Simulation storage sim = simulations[simId];

        // Aggregate results
        bytes memory results = abi.encode(
            sim.stateRoot,
            sim.currentRound,
            block.timestamp - sim.startedAt
        );

        simulationResults[simId] = results;
        sim.completed = true;
        sim.completedAt = block.timestamp;
        activeSimulations--;

        emit SimulationFinalized(
            simId,
            results,
            block.timestamp - sim.startedAt
        );
    }
}
