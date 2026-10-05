// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PatientSovereignChainMesh
 * @dev Manages per-patient dedicated ledgers across multiple hospitals and physician sub-nodes.
 */
contract PatientSovereignChainMesh {
    struct BlockRecord {
        uint256 blockIndex;
        string patientId;
        uint256 timestamp;
        string actionType;
        string originHospitalId;
        string actorNodeId;
        bytes32 payloadHash;
        bytes32 previousHash;
        bytes32 blockHash;
    }

    struct HospitalConsent {
        bool isApproved;
        uint256 expiresAt;
        uint256 decisionTimestamp;
        bytes grantedCategoriesMask;
    }

    struct StaffConsent {
        bool isApproved;
        uint256 grantedAt;
        bytes grantedCategoriesMask;
    }

    address public immutable networkGovernanceAdmin;

    // patientId => (targetHospitalId => HospitalConsent)
    mapping(string => mapping(string => HospitalConsent)) public hospitalInterTransfers;

    // patientId => (doctorSubNodeId => StaffConsent)
    mapping(string => mapping(string => StaffConsent)) public doctorGranularPermissions;

    // patientId => BlockRecord[]
    mapping(string => BlockRecord[]) private patientChains;

    event BlockMintedAndReplicated(
        string indexed patientId,
        uint256 indexed blockIndex,
        string actionType,
        string actorNodeId,
        bytes32 blockHash,
        uint256 timestamp
    );

    event InterHospitalConsentUpdated(
        string indexed patientId,
        string indexed targetHospitalId,
        bool isApproved,
        uint256 timestamp
    );

    event StaffConsentUpdated(
        string indexed patientId,
        string indexed doctorSubNodeId,
        bool isApproved,
        uint256 timestamp
    );

    constructor() {
        networkGovernanceAdmin = msg.sender;
    }

    function recordPatientBlock(
        string calldata patientId,
        string calldata actionType,
        string calldata originHospitalId,
        string calldata actorNodeId,
        bytes32 payloadHash
    ) external returns (uint256 blockIndex, bytes32 newBlockHash) {
        BlockRecord[] storage chain = patientChains[patientId];
        blockIndex = chain.length;
        
        bytes32 prevHash = blockIndex > 0 ? chain[blockIndex - 1].blockHash : bytes32(0);
        newBlockHash = keccak256(abi.encodePacked(prevHash, payloadHash, block.timestamp, blockIndex));

        chain.push(BlockRecord({
            blockIndex: blockIndex,
            patientId: patientId,
            timestamp: block.timestamp,
            actionType: actionType,
            originHospitalId: originHospitalId,
            actorNodeId: actorNodeId,
            payloadHash: payloadHash,
            previousHash: prevHash,
            blockHash: newBlockHash
        }));

        emit BlockMintedAndReplicated(patientId, blockIndex, actionType, actorNodeId, newBlockHash, block.timestamp);
    }

    function setInterHospitalConsent(
        string calldata patientId,
        string calldata targetHospitalId,
        bool isApproved,
        uint256 durationSeconds,
        bytes calldata categoriesMask
    ) external {
        hospitalInterTransfers[patientId][targetHospitalId] = HospitalConsent({
            isApproved: isApproved,
            expiresAt: block.timestamp + durationSeconds,
            decisionTimestamp: block.timestamp,
            grantedCategoriesMask: categoriesMask
        });

        emit InterHospitalConsentUpdated(patientId, targetHospitalId, isApproved, block.timestamp);
    }

    function setStaffGranularConsent(
        string calldata patientId,
        string calldata doctorSubNodeId,
        bool isApproved,
        bytes calldata categoriesMask
    ) external {
        doctorGranularPermissions[patientId][doctorSubNodeId] = StaffConsent({
            isApproved: isApproved,
            grantedAt: block.timestamp,
            grantedCategoriesMask: categoriesMask
        });

        emit StaffConsentUpdated(patientId, doctorSubNodeId, isApproved, block.timestamp);
    }

    function getPatientBlockCount(string calldata patientId) external view returns (uint256) {
        return patientChains[patientId].length;
    }

    function getPatientBlock(string calldata patientId, uint256 index) external view returns (BlockRecord memory) {
        require(index < patientChains[patientId].length, "Block index out of bounds");
        return patientChains[patientId][index];
    }
}
