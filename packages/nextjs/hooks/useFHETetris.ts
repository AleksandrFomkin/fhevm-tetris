"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "./helper";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import {
  buildParamsFromAbi,
  getEncryptionMethod,
  useFHEDecrypt,
  useFHEEncryption,
  useInMemoryStorage,
} from "@fhevm-sdk";
import type { FhevmInstance } from "@fhevm-sdk";
import { ethers } from "ethers";
import { useReadContract } from "wagmi";
import type { Contract } from "~~/utils/helper/contract";
import type { AllowedChainIds } from "~~/utils/helper/networks";

/**
 * @hook useFHETetris
 * @notice Hook for interacting with the FHETetris smart contract.
 *         Handles encrypted Tetris score submissions and private decryption.
 *
 * @dev All scores are stored as ciphertext (euint32) using Zama’s FHEVM.
 *      Only the submitting player can decrypt their own scores.
 */
export const useFHETetris = (args: {
  instance: FhevmInstance | undefined;
  initialMockChains?: Readonly<Record<number, string>>;
}) => {
  const { instance, initialMockChains } = args;
  const { storage: decryptStore } = useInMemoryStorage();
  const { chainId, accounts, isConnected, ethersReadonlyProvider, ethersSigner } = useWagmiEthers(initialMockChains);

  const activeChain = typeof chainId === "number" ? (chainId as AllowedChainIds) : undefined;
  const { data: tetrisContract } = useDeployedContractInfo({
    contractName: "FHETetris",
    chainId: activeChain,
  });

  type TetrisContractInfo = Contract<"FHETetris"> & { chainId?: number };

  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const contractReady = Boolean(tetrisContract?.address && tetrisContract?.abi);
  const signerReady = Boolean(ethersSigner);
  const providerReady = Boolean(ethersReadonlyProvider);

  const getContract = (mode: "read" | "write") => {
    if (!contractReady) return undefined;
    const source = mode === "read" ? ethersReadonlyProvider : ethersSigner;
    if (!source) return undefined;
    return new ethers.Contract(tetrisContract!.address, (tetrisContract as TetrisContractInfo).abi, source);
  };

  // Read encrypted scores from the blockchain
  const { data: encryptedScores, refetch: reloadScores } = useReadContract({
    address: contractReady ? (tetrisContract!.address as `0x${string}`) : undefined,
    abi: contractReady ? ((tetrisContract as TetrisContractInfo).abi as any) : undefined,
    functionName: "fetchScores",
    args: [accounts ? accounts[0] : ""],
    query: { enabled: Boolean(contractReady && providerReady), refetchOnWindowFocus: false },
  });

  // Prepare decrypt requests
  const decryptTargets = useMemo(() => {
    if (!encryptedScores || !Array.isArray(encryptedScores)) return undefined;
    return encryptedScores.map(item => ({
      handle: item,
      contractAddress: tetrisContract!.address,
    }));
  }, [encryptedScores, tetrisContract?.address]);

  // FHE decryption handler
  const {
    canDecrypt,
    decrypt,
    isDecrypting,
    message: decryptMessage,
    results: decryptedScores,
  } = useFHEDecrypt({
    instance,
    ethersSigner: ethersSigner as any,
    fhevmDecryptionSignatureStorage: decryptStore,
    chainId,
    requests: decryptTargets,
  });

  useEffect(() => {
    if (decryptMessage) setStatus(decryptMessage);
  }, [decryptMessage]);

  // FHE encryption handler
  const { encryptWith } = useFHEEncryption({
    instance,
    ethersSigner: ethersSigner as any,
    contractAddress: tetrisContract?.address,
  });

  const canUpload = useMemo(
    () => Boolean(contractReady && instance && signerReady && !isWorking),
    [contractReady, instance, signerReady, isWorking],
  );

  const getEncryptionType = (fnName: "uploadScore") => {
    const fnAbi = tetrisContract?.abi.find(f => f.type === "function" && f.name === fnName);
    if (!fnAbi) return { method: undefined, error: `Missing ABI for ${fnName}` };
    if (!fnAbi.inputs || fnAbi.inputs.length === 0)
      return { method: undefined, error: `Function ${fnName} has no inputs` };
    return { method: getEncryptionMethod(fnAbi.inputs[0].internalType), error: undefined };
  };

  // Upload encrypted score
  const uploadScore = useCallback(
    async (points: number) => {
      if (isWorking || !canUpload) return;
      setIsWorking(true);
      setStatus(`Encrypting and submitting score (${points})...`);
      try {
        const { method, error } = getEncryptionType("uploadScore");
        if (!method) return setStatus(error ?? "Encryption type not found");
        const encrypted = await encryptWith(builder => {
          (builder as any)[method](points);
        });
        if (!encrypted) return setStatus("Encryption failed");

        const contractWrite = getContract("write");
        if (!contractWrite) return setStatus("No signer or contract instance");

        const params = buildParamsFromAbi(encrypted, [...tetrisContract!.abi] as any[], "uploadScore");
        const tx = await contractWrite.uploadScore(...params, { gasLimit: 300_000 });
        setStatus("Waiting for transaction confirmation...");
        await tx.wait();
        setStatus(`Score (${points}) successfully submitted!`);
        await reloadScores();
      } catch (err) {
        setStatus(`uploadScore() failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsWorking(false);
      }
    },
    [isWorking, canUpload, encryptWith, getContract, reloadScores, tetrisContract?.abi],
  );

  useEffect(() => {
    setStatus("");
  }, [accounts, chainId]);

  return {
    contractAddress: tetrisContract?.address,
    canDecrypt,
    decrypt,
    isDecrypting,
    decryptedScores,
    encryptedScores,
    reloadScores,
    uploadScore,
    isProcessing: isWorking,
    canUpload,
    chainId,
    accounts,
    isConnected,
    ethersSigner,
    message: status,
  };
};
