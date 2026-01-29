// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IERC8004Identity.sol";

/**
 * @title ERC8004IdentityRegistry
 * @author Kamiyo Protocol
 * @notice Canonical ERC-8004 Identity Registry for trustless agent discovery
 * @dev ERC-721 based identity with metadata storage and EIP-712 wallet verification
 */
contract ERC8004IdentityRegistry is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    IERC8004Identity
{
    using Strings for uint256;
    using Strings for address;
    using ECDSA for bytes32;

    // ============ Constants ============

    bytes32 public constant AGENT_WALLET_KEY = keccak256("agentWallet");
    bytes32 public constant SET_WALLET_TYPEHASH = keccak256(
        "SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)"
    );

    // ============ State ============

    uint256 private _nextTokenId;

    // agentId => metadataKey hash => value
    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;

    // agentId => explicit wallet (0 means use owner)
    mapping(uint256 => address) private _agentWallets;

    // agentId => registration timestamp
    mapping(uint256 => uint64) public registeredAt;

    // ============ Errors ============

    error AgentNotFound();
    error NotAgentOwner();
    error InvalidSignature();
    error SignatureExpired();
    error ZeroAddress();

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) external initializer {
        if (_owner == address(0)) revert ZeroAddress();

        __ERC721_init("Kamiyo Agent Identity", "KAMIYO");
        __ERC721URIStorage_init();
        __EIP712_init("Kamiyo Agent Identity", "1");
        __Ownable_init(_owner);
        __Pausable_init();
    }

    // ============ Registration ============

    function register(
        string calldata agentURI,
        MetadataEntry[] calldata metadata
    ) external override whenNotPaused returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);

        for (uint256 i = 0; i < metadata.length; i++) {
            bytes32 keyHash = keccak256(bytes(metadata[i].key));
            _metadata[agentId][keyHash] = metadata[i].value;
            emit MetadataSet(agentId, metadata[i].key, metadata[i].key, metadata[i].value);
        }
    }

    function register(string calldata agentURI) external override whenNotPaused returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, agentURI);
    }

    function register() external override whenNotPaused returns (uint256 agentId) {
        agentId = _mintAgent(msg.sender, "");
    }

    function _mintAgent(address to, string memory agentURI) internal returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(to, agentId);

        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }

        registeredAt[agentId] = uint64(block.timestamp);

        emit Registered(agentId, agentURI, to);
    }

    // ============ URI Management ============

    function setAgentURI(uint256 agentId, string calldata newURI) external override {
        _requireOwned(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner();

        _setTokenURI(agentId, newURI);

        emit URIUpdated(agentId, newURI, msg.sender);
    }

    // ============ Metadata Management ============

    function setMetadata(
        uint256 agentId,
        string calldata metadataKey,
        bytes calldata metadataValue
    ) external override {
        _requireOwned(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner();

        bytes32 keyHash = keccak256(bytes(metadataKey));

        // Reserved key check
        if (keyHash == AGENT_WALLET_KEY) {
            revert("Use setAgentWallet");
        }

        _metadata[agentId][keyHash] = metadataValue;

        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getMetadata(
        uint256 agentId,
        string calldata metadataKey
    ) external view override returns (bytes memory metadataValue) {
        _requireOwned(agentId);
        bytes32 keyHash = keccak256(bytes(metadataKey));
        return _metadata[agentId][keyHash];
    }

    // ============ Wallet Management ============

    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external override {
        _requireOwned(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        if (newWallet == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify signature from newWallet
        bytes32 structHash = keccak256(abi.encode(
            SET_WALLET_TYPEHASH,
            agentId,
            newWallet,
            deadline
        ));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != newWallet) revert InvalidSignature();

        _agentWallets[agentId] = newWallet;

        // Store in metadata for ERC-8004 compatibility
        _metadata[agentId][AGENT_WALLET_KEY] = abi.encodePacked(newWallet);

        emit AgentWalletSet(agentId, newWallet);
    }

    function getAgentWallet(uint256 agentId) external view override returns (address wallet) {
        _requireOwned(agentId);
        wallet = _agentWallets[agentId];
        if (wallet == address(0)) {
            wallet = ownerOf(agentId);
        }
    }

    function unsetAgentWallet(uint256 agentId) external override {
        _requireOwned(agentId);
        if (ownerOf(agentId) != msg.sender) revert NotAgentOwner();

        delete _agentWallets[agentId];
        delete _metadata[agentId][AGENT_WALLET_KEY];

        emit AgentWalletUnset(agentId);
    }

    // ============ Global ID ============

    function getGlobalId(uint256 agentId) external view override returns (string memory globalId) {
        _requireOwned(agentId);

        return string(abi.encodePacked(
            "eip155:",
            block.chainid.toString(),
            ":",
            address(this).toHexString(),
            ":",
            agentId.toString()
        ));
    }

    // ============ View Functions ============

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function exists(uint256 agentId) external view returns (bool) {
        return agentId < _nextTokenId && _ownerOf(agentId) != address(0);
    }

    // ============ Admin Functions ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Overrides ============

    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Storage Gap ============

    uint256[46] private __gap;
}
