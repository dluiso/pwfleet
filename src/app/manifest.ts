import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "City of Harvey PW Fleet",
    short_name: "PW Fleet",
    description: "Public Works fleet inspections and vehicle readiness.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#0b2f2b",
    icons: [
      { src: "/pwfleet-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pwfleet-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
