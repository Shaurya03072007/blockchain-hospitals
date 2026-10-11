// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HealthcareAccess
 * @dev Smart Contract for immutable audit trails and EHR integrity verification.
 */
contract HealthcareAccess {
    address public contractOwner;

    struct AccessEvent {
        uint256 eventId;
        string patientCode;
        string actorUsername;
        string actorRole;
        string actionType;
        string recordHash;
        uint256 timestamp;
        bool isAuthorized;
    }

    struct PatientRecord {
        string recordHash;
        uint256 lastUpdated;
    }

    mapping(string => PatientRecord) private patientRecords;
    mapping(string => mapping(address => bool)) private doctorPermissions;
    AccessEvent[] private accessEvents;
    mapping(string => uint256[]) private patientEventIndices;

    event AccessLogged(
        uint256 indexed eventId,
        string indexed patientCode,
        string actorUsername,
        string actionType,
        bool isAuthorized,
        uint256 timestamp
    );

    event RecordRegistered(
        string indexed patientCode,
        string recordHash,
        address indexed updatedBy,
        uint256 timestamp
    );

    event PermissionGranted(
        string indexed patientCode,
        address indexed doctorWallet,
        uint256 timestamp
    );

    event PermissionRevoked(
        string indexed patientCode,
        address indexed doctorWallet,
        uint256 timestamp
    );

    constructor() {
        contractOwner = msg.sender;
    }

    function registerPatientRecord(
        string calldata patientCode,
        string calldata recordHash
    ) external {
        patientRecords[patientCode] = PatientRecord({
            recordHash: recordHash,
            lastUpdated: block.timestamp
        });

        emit RecordRegistered(patientCode, recordHash, msg.sender, block.timestamp);
    }

    function verifyRecordHash(
        string calldata patientCode,
        string calldata testHash
    ) external view returns (bool isMatch, string memory storedHash, uint256 lastUpdated) {
        PatientRecord memory rec = patientRecords[patientCode];
        storedHash = rec.recordHash;
        lastUpdated = rec.lastUpdated;
        isMatch = (keccak256(bytes(storedHash)) == keccak256(bytes(testHash)));
    }

    function recordAccessEvent(
        string calldata patientCode,
        string calldata actorUsername,
        string calldata actorRole,
        string calldata actionType,
        string calldata recordHash,
        bool isAuthorized
    ) external returns (uint256) {
        uint256 eventId = accessEvents.length + 1;
        AccessEvent memory newEvent = AccessEvent({
            eventId: eventId,
            patientCode: patientCode,
            actorUsername: actorUsername,
            actorRole: actorRole,
            actionType: actionType,
            recordHash: recordHash,
            timestamp: block.timestamp,
            isAuthorized: isAuthorized
        });

        accessEvents.push(newEvent);
        patientEventIndices[patientCode].push(accessEvents.length - 1);

        emit AccessLogged(
            eventId,
            patientCode,
            actorUsername,
            actionType,
            isAuthorized,
            block.timestamp
        );

        return eventId;
    }

    function grantDoctorPermission(
        string calldata patientCode,
        address doctorWallet
    ) external {
        doctorPermissions[patientCode][doctorWallet] = true;
        emit PermissionGranted(patientCode, doctorWallet, block.timestamp);
    }

    function revokeDoctorPermission(
        string calldata patientCode,
        address doctorWallet
    ) external {
        doctorPermissions[patientCode][doctorWallet] = false;
        emit PermissionRevoked(patientCode, doctorWallet, block.timestamp);
    }

    function hasDoctorPermission(
        string calldata patientCode,
        address doctorWallet
    ) external view returns (bool) {
        return doctorPermissions[patientCode][doctorWallet];
    }

    function getAuditTrail(
        string calldata patientCode
    ) external view returns (AccessEvent[] memory) {
        uint256[] memory indices = patientEventIndices[patientCode];
        AccessEvent[] memory trail = new AccessEvent[](indices.length);
        for (uint256 i = 0; i < indices.length; i++) {
            trail[i] = accessEvents[indices[i]];
        }
        return trail;
    }

    function getTotalAccessEvents() external view returns (uint256) {
        return accessEvents.length;
    }

    function getRecentEvents(
        uint256 count
    ) external view returns (AccessEvent[] memory) {
        uint256 total = accessEvents.length;
        if (count > total) {
            count = total;
        }
        AccessEvent[] memory recent = new AccessEvent[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = accessEvents[total - count + i];
        }
        return recent;
    }
}

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
