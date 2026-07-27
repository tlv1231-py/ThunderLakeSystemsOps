"use client";
import dynamic from "next/dynamic";

const StamfordMap = dynamic(() => import("./StamfordMap"), { ssr: false });

export default function MapWrapper() {
  return <StamfordMap />;
}
