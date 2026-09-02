"use client";

import { MapPin, RotateCcw, X } from "lucide-react";
import { useState } from "react";

export type DamageMarker = {
  view: string;
  x: number;
  y: number;
  damageType: string;
};

const vehicleViews = ["Driver side", "Passenger side", "Front", "Rear"];
const damageTypes = ["Scratch", "Dent", "Broken", "Cracked", "Loose", "Missing", "Other"];

export function DamageMap({
  value,
  onChange,
}: {
  value: DamageMarker[];
  onChange: (markers: DamageMarker[]) => void;
}) {
  const [activeView, setActiveView] = useState(vehicleViews[0]!);
  const [damageType, setDamageType] = useState(damageTypes[0]!);
  const visibleMarkers = value.filter((marker) => marker.view === activeView);

  function addMarker(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    onChange([...value, { view: activeView, x, y, damageType }]);
  }

  return (
    <div className="damage-map">
      <div className="damage-map-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Vehicle view">
          {vehicleViews.map((view) => (
            <button
              key={view}
              type="button"
              className={activeView === view ? "active" : ""}
              onClick={() => setActiveView(view)}
            >
              {view}
            </button>
          ))}
        </div>
        <label className="damage-type-select">
          <span>Damage type</span>
          <select value={damageType} onChange={(event) => setDamageType(event.target.value)}>
            {damageTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
      </div>

      <button className="vehicle-diagram-button" type="button" aria-label={`Mark damage on ${activeView}`}>
        <svg
          className="vehicle-diagram"
          viewBox="0 0 600 260"
          role="img"
          aria-label={`${activeView} vehicle diagram. Click to add a damage marker.`}
          onClick={addMarker}
        >
          <defs>
            <linearGradient id="truckFill" x1="0" x2="1">
              <stop offset="0" stopColor="#dbeae3" />
              <stop offset="1" stopColor="#edf4f0" />
            </linearGradient>
          </defs>
          {activeView === "Front" || activeView === "Rear" ? (
            <g>
              <rect x="190" y="48" width="220" height="145" rx="28" fill="url(#truckFill)" stroke="#275b50" strokeWidth="5" />
              <rect x="220" y="66" width="160" height="66" rx="12" fill="#bdd8ce" stroke="#275b50" strokeWidth="4" />
              <rect x="205" y="145" width="46" height="28" rx="8" fill="#f5d178" stroke="#7d6023" strokeWidth="3" />
              <rect x="349" y="145" width="46" height="28" rx="8" fill="#f5d178" stroke="#7d6023" strokeWidth="3" />
              <rect x="165" y="175" width="270" height="25" rx="10" fill="#406b61" />
              <rect x="177" y="198" width="48" height="24" rx="9" fill="#263b37" />
              <rect x="375" y="198" width="48" height="24" rx="9" fill="#263b37" />
            </g>
          ) : (
            <g transform={activeView === "Passenger side" ? "translate(600 0) scale(-1 1)" : undefined}>
              <path d="M75 175 L102 108 L238 89 L304 128 L505 132 L535 176 Z" fill="url(#truckFill)" stroke="#275b50" strokeWidth="5" strokeLinejoin="round" />
              <path d="M123 111 L223 99 L273 132 L103 132 Z" fill="#bdd8ce" stroke="#275b50" strokeWidth="4" />
              <line x1="232" y1="101" x2="232" y2="171" stroke="#275b50" strokeWidth="4" />
              <rect x="310" y="100" width="195" height="70" rx="4" fill="#c7ddd4" stroke="#275b50" strokeWidth="5" />
              <circle cx="166" cy="181" r="42" fill="#283b37" />
              <circle cx="166" cy="181" r="19" fill="#bdc7c3" />
              <circle cx="456" cy="181" r="42" fill="#283b37" />
              <circle cx="456" cy="181" r="19" fill="#bdc7c3" />
              <rect x="61" y="162" width="33" height="19" rx="7" fill="#f5d178" stroke="#7d6023" strokeWidth="3" />
            </g>
          )}
          {visibleMarkers.map((marker, index) => (
            <g key={`${marker.x}-${marker.y}-${index}`} transform={`translate(${marker.x * 600} ${marker.y * 260})`}>
              <circle r="17" fill="#b4413c" stroke="white" strokeWidth="5" />
              <text y="5" textAnchor="middle" fill="white" fontSize="13" fontWeight="800">{index + 1}</text>
            </g>
          ))}
        </svg>
      </button>
      <p className="diagram-help"><MapPin size={14} /> Select a damage type, then tap the vehicle where the issue is located.</p>

      {visibleMarkers.length ? (
        <div className="marker-list">
          {visibleMarkers.map((marker) => {
            const globalIndex = value.indexOf(marker);
            return (
              <div key={`${marker.x}-${marker.y}-${globalIndex}`}>
                <span>{marker.damageType} · {marker.view}</span>
                <button type="button" aria-label={`Remove ${marker.damageType} marker`} onClick={() => onChange(value.filter((_, index) => index !== globalIndex))}><X size={14} /></button>
              </div>
            );
          })}
          <button className="clear-markers" type="button" onClick={() => onChange(value.filter((marker) => marker.view !== activeView))}><RotateCcw size={13} /> Clear this view</button>
        </div>
      ) : null}
    </div>
  );
}

