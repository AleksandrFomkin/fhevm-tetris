
"use client";

import { FHETetris } from "./_components/FHETetris";
import { useAccount } from "wagmi";

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="flex flex-col gap-8 items-center sm:items-start w-full px-3 md:px-0">
      {isConnected && (
        <div className="w-full mt-10 text-3xl mb-3 font-bold tracking-wide text-white text-center">🧱 FHETetris</div>
      )}
      <FHETetris />
    </div>
  );
}
