"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 skeleton" />,
});

export default Map;
