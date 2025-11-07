// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHETetris
 * @author 
 * @notice Encrypted score tracker for a decentralized Tetris-style game
 *         using Fully Homomorphic Encryption (FHE).
 *
 * @dev This contract allows players to securely submit their gameplay
 *      scores in encrypted form. All values remain private — neither
 *      the contract owner nor others can read the plaintext scores.
 *
 *      Concept:
 *      - Players encrypt their numeric score off-chain.
 *      - The ciphertext is verified and stored on-chain.
 *      - Only the original sender can later decrypt and verify it.
 */
contract FHETetris is SepoliaConfig {
    /// @dev Keeps encrypted Tetris scores per player address.
    mapping(address => euint32[]) private _playerScores;

    /**
     * @notice Submit an encrypted Tetris score.
     * @param encryptedScore The encrypted score, generated client-side.
     * @param proof The zero-knowledge proof confirming valid encryption.
     *
     * @dev Converts external ciphertext into an internal FHE type,
     *      grants the contract temporary access to process it,
     *      and records it under the player’s address.
     */
    function uploadScore(externalEuint32 encryptedScore, bytes calldata proof) external {
        euint32 internalScore = FHE.fromExternal(encryptedScore, proof);
        FHE.allowThis(internalScore);

        _playerScores[msg.sender].push(internalScore);

        // Only the original sender should be able to decrypt their own scores
        FHE.allow(internalScore, msg.sender);
    }

    /**
     * @notice Retrieve the encrypted score list for a given player.
     * @param player The player’s wallet address.
     * @return scores The ciphertext list of all submitted scores.
     *
     * @dev Returned data cannot be interpreted without FHE private keys.
     */
    function fetchScores(address player) external view returns (euint32[] memory scores) {
        return _playerScores[player];
    }
}
