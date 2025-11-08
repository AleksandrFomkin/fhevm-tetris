"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFhevm } from "@fhevm-sdk";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useFHETetris } from "~~/hooks/useFHETetris";

export const FHETetris = () => {
  const { isConnected, chain } = useAccount();
  const activeChain = chain?.id;
  const ethProvider = useMemo(() => (typeof window !== "undefined" ? (window as any).ethereum : undefined), []);

  const demoChains = {
    11155111: `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  };

  const { instance: fheInstance } = useFhevm({
    provider: ethProvider,
    chainId: activeChain,
    initialMockChains: demoChains,
    enabled: true,
  });

  const { uploadScore, reloadScores, decrypt, decryptedScores, encryptedScores, isDecrypting, canUpload, message } =
    useFHETetris({
      instance: fheInstance,
      initialMockChains: demoChains,
    });

  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [intervalId, setIntervalId] = useState<any>(null);

  /** === GAME LOGIC === */
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 26;
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;

    const colors = [null, "#FDE68A", "#FBBF24", "#FB923C", "#38BDF8", "#86EFAC", "#C084FC", "#F87171"];

    const shapes = [
      [],
      [[1, 1, 1, 1]],
      [
        [2, 0, 0],
        [2, 2, 2],
      ],
      [
        [0, 0, 3],
        [3, 3, 3],
      ],
      [
        [4, 4],
        [4, 4],
      ],
      [
        [0, 5, 5],
        [5, 5, 0],
      ],
      [
        [0, 6, 0],
        [6, 6, 6],
      ],
      [
        [7, 7, 0],
        [0, 7, 7],
      ],
    ];

    const arena: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    const player = {
      pos: { x: 0, y: 0 },
      matrix: shapes[Math.floor(Math.random() * (shapes.length - 1)) + 1],
    };

    const collide = (arena: number[][], player: any) => {
      const [m, o] = [player.matrix, player.pos];
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
          if (m[y][x] && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
      }
      return false;
    };

    const merge = (arena: number[][], player: any) => {
      player.matrix.forEach((row: any[], y: number) => {
        row.forEach((val, x) => {
          if (val !== 0) arena[y + player.pos.y][x + player.pos.x] = val;
        });
      });
    };

    const sweep = () => {
      let rowCount = 1;
      for (let y = arena.length - 1; y > 0; --y) {
        if (arena[y].every(x => x !== 0)) {
          const row = arena.splice(y, 1)[0].fill(0);
          arena.unshift(row);
          y++;
          setScore(s => s + rowCount * 15);
          rowCount *= 2;
        }
      }
    };

    const drawMatrix = (matrix: number[][], offset: { x: number; y: number }) => {
      matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            ctx.fillStyle = colors[value]!;
            ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          }
        });
      });
    };

    const draw = () => {
      ctx.fillStyle = "rgba(20, 16, 40, 1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawMatrix(arena, { x: 0, y: 0 });
      drawMatrix(player.matrix, player.pos);
    };

    const playerReset = () => {
      player.matrix = shapes[Math.floor(Math.random() * (shapes.length - 1)) + 1];
      player.pos.y = 0;
      player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
      if (collide(arena, player)) {
        setGameOver(true);
        resetGame();
        clearInterval(intervalId);
      }
    };

    const playerDrop = () => {
      if (gameOver) return;
      player.pos.y++;
      if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        sweep();
        playerReset();
      }
      draw();
    };

    const movePlayer = (dir: number) => {
      player.pos.x += dir;
      if (collide(arena, player)) player.pos.x -= dir;
      draw();
    };

    const rotate = (matrix: number[][]) => matrix[0].map((_, i) => matrix.map(row => row[i])).reverse();

    const playerRotate = () => {
      const pos = player.pos.x;
      let offset = 1;
      player.matrix = rotate(player.matrix);
      while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) return;
      }
      draw();
    };

    const keyListener = (e: KeyboardEvent) => {
      if (gameOver) return;
      if (e.key === "ArrowLeft") movePlayer(-1);
      else if (e.key === "ArrowRight") movePlayer(1);
      else if (e.key === "ArrowDown") playerDrop();
      else if (e.key === "ArrowUp") playerRotate();
    };

    document.addEventListener("keydown", keyListener);

    const loop = setInterval(playerDrop, 200);
    setIntervalId(loop);

    draw();

    return () => {
      document.removeEventListener("keydown", keyListener);
      clearInterval(loop);
    };
  }, [canvasRef, started, gameOver]);

  const handleSubmitScore = async () => {
    if (!canUpload) return setFeedbackMsg("⚠️ Wallet not ready or busy");
    try {
      setFeedbackMsg("🔐 Encrypting & submitting your score...");
      await uploadScore(score);
      await reloadScores();
      setFeedbackMsg("✅ Score uploaded successfully!");
    } catch (err) {
      console.error(err);
      setFeedbackMsg("❌ Failed to submit score");
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedScores?.length) return;
    await decrypt();
  };

  const resetGame = () => {
    setFeedbackMsg("");
    setStarted(false);
  };

  if (!isConnected)
    return (
      <div className="w-full h-[calc(100vh-100px)] flex justify-center items-center">
        <motion.div
          className="bg-gradient-to-br from-amber-700/30 to-violet-800/30 border border-amber-400 rounded-2xl p-12 text-center shadow-2xl backdrop-blur-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="text-5xl mb-6 animate-pulse">🎮</div>
          <h2 className="text-3xl font-extrabold mb-3 text-amber-200 drop-shadow-lg">
            Connect Wallet to Play FHETetris
          </h2>
          <RainbowKitCustomConnectButton />
        </motion.div>
      </div>
    );

  return (
    <div className="w-full text-amber-100 flex justify-center items-start py-12">
      <div className="flex gap-8">
        {/* LEFT: GAME */}
        <div className="flex-1 bg-black/40 p-6 rounded-2xl border border-amber-600 shadow-xl backdrop-blur-md">
          <div className="relative" style={{ height: 520, width: 300 }}>
            {!started && (
              <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/80 rounded-lg border border-amber-500 shadow-lg text-amber-300 z-10">
                <button
                  onClick={() => {
                    setGameOver(false);
                    setStarted(true);
                    setScore(0);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-all"
                >
                  ▶️ Start
                </button>
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="border border-amber-500 bg-gradient-to-br from-violet-950 to-black rounded-lg shadow-xl w-full h-full"
            ></canvas>
          </div>

          <div className="mt-4 text-lg font-semibold text-amber-200">Score: {score}</div>

          {gameOver && (
            <div className="mt-4 text-amber-400 font-bold animate-pulse">
              💀 Game Over
              <div className="mt-3 flex gap-3">
                <button
                  onClick={handleSubmitScore}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-black font-semibold shadow"
                >
                  📤 Submit Score
                </button>
              </div>
            </div>
          )}

          <p className="mt-3 text-sm text-amber-300">{feedbackMsg || message}</p>
        </div>

        {/* RIGHT: HISTORY */}
        <div className="w-[350px] bg-black/50 border border-amber-600 p-6 rounded-2xl flex flex-col shadow-lg backdrop-blur-md">
          <h3 className="text-xl font-semibold text-amber-200 mb-4 tracking-wide">📜 Scoreboard</h3>

          <div className="overflow-y-auto flex-1 border border-amber-700 divide-y divide-amber-800 rounded-lg mb-4">
            <div className="text-sm bg-amber-900/40 font-semibold px-3 py-2">On-chain Score Records</div>
            {encryptedScores?.length ? (
              encryptedScores.map((item: string, i: number) => {
                const decrypted = decryptedScores?.[item];
                const isValid = decrypted !== undefined && !isNaN(Number(decrypted));
                return (
                  <div key={i} className="flex justify-between px-3 py-2 text-sm hover:bg-amber-900/30">
                    <span className="text-amber-400 font-mono">#{i + 1}</span>
                    {isValid ? (
                      <span className="text-green-400 font-semibold flex gap-2 items-center">
                        🎯 {Number(decrypted)} pts
                      </span>
                    ) : (
                      <span className="text-amber-500/70 flex gap-2 items-center">
                        🔒 <em>Encrypted</em>
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center text-amber-600 italic py-4">🚫 No scores yet — be the first to play!</div>
            )}
          </div>

          <button
            onClick={handleDecrypt}
            disabled={isDecrypting || !encryptedScores?.length}
            className={`mt-auto px-4 py-2 border border-amber-400 rounded-md text-sm font-medium transition-all ${
              isDecrypting ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-400 hover:text-black cursor-pointer"
            }`}
          >
            {isDecrypting ? "Decrypting..." : "🔍 Reveal Encrypted Scores"}
          </button>
        </div>
      </div>
    </div>
  );
};
