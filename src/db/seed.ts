import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "./client";
import {
  inspectionItemRules,
  inspectionItems,
  inspectionSections,
  inspectionTemplates,
  users,
  vehicleClasses,
  vehicleInspectionAssignments,
  vehicleQrCodes,
  vehicles,
} from "./schema";

type FieldType =
  | "pass_defect_na"
  | "text"
  | "textarea"
  | "number"
  | "odometer"
  | "fuel_level"
  | "photo"
  | "attestation"
  | "damage_map"
  | "select";

type Severity = "advisory" | "minor" | "major" | "critical";
type Disposition =
  | "cleared_with_advisory"
  | "hold_for_review"
  | "out_of_service";

type SeedRule = {
  severity: Severity;
  disposition: Disposition;
  blockDeparture: boolean;
  requireComment: boolean;
  requirePhoto: boolean;
};

type SeedItem = {
  key: string;
  label: string;
  fieldType?: FieldType;
  required?: boolean;
  helpText?: string;
  options?: string[];
  rule?: SeedRule;
};

type SeedSection = {
  key: string;
  title: string;
  description?: string;
  items: SeedItem[];
};

const criticalRule: SeedRule = {
  severity: "critical",
  disposition: "out_of_service",
  blockDeparture: true,
  requireComment: true,
  requirePhoto: true,
};

const majorRule: SeedRule = {
  severity: "major",
  disposition: "hold_for_review",
  blockDeparture: true,
  requireComment: true,
  requirePhoto: true,
};

const minorRule: SeedRule = {
  severity: "minor",
  disposition: "cleared_with_advisory",
  blockDeparture: false,
  requireComment: true,
  requirePhoto: false,
};

const dumpTruckSections: SeedSection[] = [
  {
    key: "trip_readings",
    title: "Trip Readings",
    items: [
      { key: "odometer_start", label: "Odometer reading at start", fieldType: "odometer" },
      {
        key: "fuel_start",
        label: "Fuel level at start",
        fieldType: "fuel_level",
        options: ["Empty", "1/4 tank", "1/2 tank", "3/4 tank", "Full"],
      },
    ],
  },
  {
    key: "walkaround",
    title: "Walk-Around Visual Inspection",
    description: "Select Pass, Defect, or Not Applicable for every item.",
    items: [
      { key: "body_damage", label: "Body condition", rule: minorRule },
      { key: "tire_tread", label: "Tire tread meets required standard", rule: criticalRule },
      { key: "windows", label: "Windows", rule: majorRule },
      { key: "mirrors", label: "Mirrors", rule: criticalRule },
      {
        key: "under_vehicle_leaks",
        label: "No fluid leaks or irregularities under vehicle",
        rule: majorRule,
      },
    ],
  },
  {
    key: "under_hood",
    title: "Under-the-Hood Inspection",
    items: [
      { key: "oil", label: "Engine oil is full and clean", rule: majorRule },
      { key: "transmission_fluid", label: "Transmission fluid", rule: majorRule },
      { key: "coolant", label: "Coolant", rule: majorRule },
      { key: "belts", label: "Belts", rule: majorRule },
      { key: "battery_cables", label: "Battery and cables", rule: majorRule },
    ],
  },
  {
    key: "interior",
    title: "Interior Inspection",
    items: [
      { key: "seating", label: "Seating condition and cleanliness", rule: minorRule },
      { key: "seatbelts", label: "Seatbelts", rule: criticalRule },
      { key: "parking_brake", label: "Parking brake", rule: criticalRule },
      { key: "horn", label: "City and highway horn", rule: criticalRule },
      { key: "first_aid_kit", label: "First aid kit is onboard and stocked", rule: minorRule },
      {
        key: "fire_extinguisher",
        label: "Fire extinguisher is onboard and charged",
        rule: majorRule,
      },
    ],
  },
  {
    key: "startup",
    title: "Start-Up Inspection",
    items: [
      {
        key: "starts_normally",
        label: "Vehicle starts without unusual sounds or hesitation",
        rule: majorRule,
      },
      { key: "airbag_warning", label: "Airbag warning light is off", rule: majorRule },
      { key: "steering", label: "Steering wheel and column", rule: criticalRule },
      { key: "lights_signals", label: "Lights and turn signals", rule: criticalRule },
      {
        key: "brakes",
        label: "Brakes, lines, and brake chambers show no leaks",
        rule: criticalRule,
      },
      { key: "mirror_adjustment", label: "Mirrors are adjusted", rule: minorRule },
    ],
  },
  {
    key: "commercial_vehicle",
    title: "Commercial Vehicle Inspection",
    items: [
      { key: "hydraulic_system", label: "Hydraulic box and system", rule: majorRule },
      { key: "tarp", label: "Tarp is not ripped, frayed, or torn", rule: minorRule },
      { key: "reflective_triangles", label: "Reflective triangles are present", rule: majorRule },
      { key: "dump_bed", label: "Dump bed is in good condition", rule: majorRule },
      { key: "pintle_hook", label: "Pintle hook and hitch plate", rule: criticalRule },
      { key: "kingpin_fifth_wheel", label: "Kingpin and fifth wheel", rule: criticalRule },
    ],
  },
  {
    key: "damage_and_notes",
    title: "Damage and Driver Notes",
    items: [
      {
        key: "damage_map",
        label: "Exterior damage map",
        fieldType: "damage_map",
        required: false,
      },
      {
        key: "driver_notes",
        label: "Driver notes",
        fieldType: "textarea",
        required: false,
      },
      {
        key: "attestation",
        label: "I certify that I completed this inspection accurately.",
        fieldType: "attestation",
      },
    ],
  },
];

const standardTruckSections: SeedSection[] = [
  {
    key: "vehicle_readings",
    title: "Vehicle and Trip Information",
    items: [
      { key: "trailer_number", label: "Trailer number", fieldType: "text", required: false },
      { key: "odometer", label: "Odometer", fieldType: "odometer" },
      {
        key: "fuel_level",
        label: "Fuel level",
        fieldType: "fuel_level",
        options: ["Empty", "1/4 tank", "1/2 tank", "3/4 tank", "Full"],
      },
    ],
  },
  {
    key: "mechanical",
    title: "Mechanical Inspection",
    items: [
      { key: "engine_oil", label: "Engine oil", rule: majorRule },
      { key: "brake_fluid", label: "Brake fluid reservoir", rule: criticalRule },
      { key: "transmission", label: "Transmission fluid, if equipped with dipstick", rule: majorRule },
      { key: "coolant", label: "Coolant", rule: majorRule },
      { key: "power_steering", label: "Power steering", rule: criticalRule },
      { key: "windshield_washer", label: "Windshield washer fluid", rule: minorRule },
      { key: "wiper_blades", label: "Wiper blades", rule: criticalRule },
      { key: "battery_health", label: "Battery health", rule: majorRule },
      { key: "battery_connections", label: "Battery cables and connections", rule: majorRule },
      { key: "mirrors", label: "Mirrors", rule: criticalRule },
      { key: "lights", label: "Lights", rule: criticalRule },
      { key: "tires", label: "Tires", rule: criticalRule },
      {
        key: "mechanical_comments",
        label: "Problems and comments",
        fieldType: "textarea",
        required: false,
      },
    ],
  },
  {
    key: "vehicle_condition",
    title: "Vehicle Condition and Handover",
    description: "This section records physical condition and does not replace the mechanical inspection.",
    items: [
      {
        key: "damage_map",
        label: "Exterior damage map",
        fieldType: "damage_map",
        required: false,
      },
      {
        key: "interior_overall",
        label: "Overall interior condition",
        fieldType: "select",
        options: ["Clean", "Average", "Dirty"],
      },
      ...["Front carpet", "Rear carpet", "Front seat", "Rear seat", "Door panels", "Dashboard"].map(
        (label) => ({
          key: `condition_${label.toLowerCase().replaceAll(" ", "_")}`,
          label,
          fieldType: "select" as const,
          options: ["Good", "Worn", "Burn", "Rips", "Stain"],
        }),
      ),
      ...["Left front", "Right front", "Left rear", "Right rear"].map((label) => ({
        key: `tire_${label.toLowerCase().replaceAll(" ", "_")}`,
        label: `${label} tire condition`,
        fieldType: "select" as const,
        options: ["Good", "Fair", "Poor"],
      })),
      { key: "end_of_day_mileage", label: "End-of-day mileage", fieldType: "odometer" },
      {
        key: "handover_attestation",
        label: "I delivered the vehicle in the condition described above.",
        fieldType: "attestation",
      },
    ],
  },
];

async function ensureUser(email: string, displayName: string, role: typeof users.$inferInsert.role) {
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(users).values({ email, displayName, role }).returning();
  return inserted[0]!;
}

async function ensureVehicleClass(code: string, name: string, description: string) {
  const existing = await db
    .select()
    .from(vehicleClasses)
    .where(eq(vehicleClasses.code, code))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(vehicleClasses).values({ code, name, description }).returning();
  return inserted[0]!;
}

async function ensureVehicle(input: {
  unitNumber: string;
  displayCode: string;
  vehicleClassId: string;
  year: number;
  make: string;
  model: string;
}) {
  const existing = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.unitNumber, input.unitNumber))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(vehicles).values(input).returning();
  return inserted[0]!;
}

async function ensureTemplate(input: {
  code: string;
  name: string;
  description: string;
  sections: SeedSection[];
}) {
  const existing = await db
    .select()
    .from(inspectionTemplates)
    .where(
      and(eq(inspectionTemplates.code, input.code), eq(inspectionTemplates.version, 1)),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  return db.transaction(async (transaction) => {
    const [template] = await transaction
      .insert(inspectionTemplates)
      .values({
        code: input.code,
        name: input.name,
        description: input.description,
        version: 1,
        status: "published",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        publishedAt: new Date(),
        ruleSetStatus: "draft",
      })
      .returning();

    for (const [sectionIndex, sectionInput] of input.sections.entries()) {
      const [section] = await transaction
        .insert(inspectionSections)
        .values({
          templateId: template!.id,
          sectionKey: sectionInput.key,
          title: sectionInput.title,
          description: sectionInput.description,
          sortOrder: sectionIndex,
        })
        .returning();

      for (const [itemIndex, itemInput] of sectionInput.items.entries()) {
        const [item] = await transaction
          .insert(inspectionItems)
          .values({
            templateId: template!.id,
            sectionId: section!.id,
            itemKey: itemInput.key,
            label: itemInput.label,
            helpText: itemInput.helpText,
            fieldType: itemInput.fieldType ?? "pass_defect_na",
            required: itemInput.required ?? true,
            sortOrder: itemIndex,
            options: itemInput.options,
          })
          .returning();

        if (itemInput.rule) {
          const rule = itemInput.rule;
          await transaction.insert(inspectionItemRules).values({
            inspectionItemId: item!.id,
            whenResponse: "defect",
            severity: rule.severity,
            disposition: rule.disposition,
            blockDeparture: rule.blockDeparture,
            requireComment: rule.requireComment,
            requirePhoto: rule.requirePhoto,
            createDefect: true,
            notifyDriver: rule.blockDeparture,
            notifySupervisor: rule.severity === "major" || rule.severity === "critical",
            notifyMaintenance: rule.severity === "critical",
            driverMessage: rule.blockDeparture
              ? "Do not operate this vehicle. Wait for supervisor instructions."
              : "The defect was recorded and will be included in the inspection report.",
            priority: rule.severity === "critical" ? 1000 : rule.severity === "major" ? 500 : 100,
          });
        }
      }
    }

    return template!;
  });
}

async function ensureQr(vehicleId: string, issuedByUserId: string) {
  const existing = await db
    .select()
    .from(vehicleQrCodes)
    .where(and(eq(vehicleQrCodes.vehicleId, vehicleId), eq(vehicleQrCodes.status, "active")))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(vehicleQrCodes)
    .values({ vehicleId, issuedByUserId })
    .returning();
  return inserted[0]!;
}

async function ensureAssignment(vehicleId: string, templateId: string) {
  const existing = await db
    .select()
    .from(vehicleInspectionAssignments)
    .where(
      and(
        eq(vehicleInspectionAssignments.vehicleId, vehicleId),
        eq(vehicleInspectionAssignments.templateId, templateId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(vehicleInspectionAssignments)
    .values({
      vehicleId,
      templateId,
      frequency: "before_first_departure",
      autoLaunch: true,
    })
    .returning();
  return inserted[0]!;
}

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed data is forbidden in production.");
  }

  const admin = await ensureUser("admin@local.invalid", "Development Administrator", "administrator");
  await ensureUser("driver@local.invalid", "Jordan Driver", "driver");
  await ensureUser("supervisor@local.invalid", "Morgan Supervisor", "supervisor");
  await ensureUser("maintenance@local.invalid", "Taylor Maintenance", "maintenance_technician");

  const dumpTruckClass = await ensureVehicleClass(
    "DT",
    "Dump Truck",
    "Dump trucks and related heavy commercial vehicles.",
  );
  const pickupClass = await ensureVehicleClass(
    "PK",
    "Pickup Truck",
    "Standard pickup trucks used by Public Works.",
  );

  const dump03 = await ensureVehicle({
    unitNumber: "03",
    displayCode: "DT-03",
    vehicleClassId: dumpTruckClass.id,
    year: 2022,
    make: "International",
    model: "HV Series",
  });
  const pickup20 = await ensureVehicle({
    unitNumber: "20",
    displayCode: "PK-20",
    vehicleClassId: pickupClass.id,
    year: 2023,
    make: "Ford",
    model: "F-250",
  });
  const dump44 = await ensureVehicle({
    unitNumber: "44",
    displayCode: "DT-44",
    vehicleClassId: dumpTruckClass.id,
    year: 2021,
    make: "Freightliner",
    model: "114SD",
  });

  const dumpTemplate = await ensureTemplate({
    code: "DUMP_TRUCK_PRETRIP",
    name: "Dump Truck Pre-Trip Inspection",
    description: "Daily pre-trip inspection based on the supplied ORS-21 source form.",
    sections: dumpTruckSections,
  });
  const standardTemplate = await ensureTemplate({
    code: "STANDARD_TRUCK_INSPECTION",
    name: "Standard Truck Inspection",
    description:
      "Mechanical inspection and vehicle condition handover based on the supplied two-page source document.",
    sections: standardTruckSections,
  });

  for (const vehicle of [dump03, pickup20, dump44]) {
    await ensureQr(vehicle.id, admin.id);
  }

  await ensureAssignment(dump03.id, dumpTemplate.id);
  await ensureAssignment(dump44.id, dumpTemplate.id);
  await ensureAssignment(pickup20.id, standardTemplate.id);
}

seed()
  .then(async () => {
    process.stdout.write("Development data is ready.\n");
    await pool.end();
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown seed error";
    process.stderr.write(`${message}\n`);
    await pool.end();
    process.exitCode = 1;
  });

