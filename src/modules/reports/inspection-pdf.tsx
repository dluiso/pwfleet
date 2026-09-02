import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { withReportRenderSlot } from "./render-admission";
import { formatDateTime, formatEnum, vehicleLabel } from "@/lib/format";
import type { getInspectionReport } from "./repository";

type InspectionReport = Awaited<ReturnType<typeof getInspectionReport>>;

const colors = {
  forest: "#123f36",
  green: "#1d775e",
  ink: "#17211e",
  muted: "#5d6d68",
  line: "#d9e1de",
  pale: "#f4f7f5",
  red: "#a23732",
  redPale: "#fff0ef",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingRight: 38,
    paddingBottom: 44,
    paddingLeft: 38,
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: colors.ink,
  },
  brand: { fontSize: 8, color: colors.green, letterSpacing: 1.1 },
  title: { marginTop: 5, fontSize: 19, fontFamily: "Helvetica-Bold", color: colors.forest },
  subtitle: { marginTop: 4, fontSize: 8, color: colors.muted },
  summary: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    backgroundColor: colors.pale,
  },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 7 },
  summaryCell: { flexGrow: 1, flexBasis: 0 },
  label: { marginBottom: 2, fontSize: 6.5, color: colors.muted, letterSpacing: 0.5 },
  value: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  statusStrip: {
    marginTop: 10,
    padding: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 4,
    backgroundColor: colors.redPale,
  },
  statusSafe: { backgroundColor: "#eaf6f0" },
  statusValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.red },
  statusValueSafe: { color: colors.green },
  section: { marginTop: 15 },
  sectionTitle: {
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.forest,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: colors.forest,
  },
  answerRow: {
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.line,
  },
  answerLabel: { width: "50%", paddingRight: 8 },
  answerValue: { width: "24%", paddingRight: 8, fontFamily: "Helvetica-Bold" },
  answerComment: { width: "26%", color: colors.muted },
  defect: {
    marginTop: 6,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.red,
    backgroundColor: colors.redPale,
  },
  defectTitle: { fontFamily: "Helvetica-Bold", color: colors.red },
  defectText: { marginTop: 3, color: colors.muted },
  footer: {
    position: "absolute",
    right: 38,
    bottom: 22,
    left: 38,
    color: colors.muted,
    fontSize: 6.5,
  },
  footerBrand: { position: "absolute", left: 0 },
  footerPage: { position: "absolute", right: 0, textAlign: "right" },
});

function displayResponse(response: unknown): string {
  if (response === null || response === undefined || response === "") return "Not provided";
  if (typeof response === "boolean") return response ? "Yes" : "No";
  if (typeof response === "number") return response.toLocaleString("en-US");
  if (typeof response === "string") return formatEnum(response);
  if (Array.isArray(response)) {
    if (!response.length) return "None marked";
    return response
      .map((entry, index) => {
        if (typeof entry !== "object" || entry === null) return String(entry);
        const marker = entry as Record<string, unknown>;
        return `${index + 1}. ${formatEnum(String(marker.damageType ?? "damage"))} - ${formatEnum(String(marker.view ?? "vehicle"))}`;
      })
      .join("; ");
  }
  return "Recorded";
}

function InspectionDocument({ report }: { report: InspectionReport }) {
  const blocked = [
    "hold_for_review",
    "out_of_service",
    "maintenance_in_progress",
    "ready_for_reinspection",
  ].includes(report.disposition);
  const unit = vehicleLabel(report);

  return (
    <Document title={`${unit} - ${report.templateName}`} author="City of Harvey Public Works">
      <Page size="LETTER" style={styles.page} wrap>
        <Text style={styles.brand}>CITY OF HARVEY - PUBLIC WORKS</Text>
        <Text style={styles.title}>Vehicle Inspection Report</Text>
        <Text style={styles.subtitle}>
          System record {report.id} - Generated from the fleet operations platform
        </Text>

        <View style={styles.summary} wrap={false}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}><Text style={styles.label}>VEHICLE</Text><Text style={styles.value}>{unit}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>FORM</Text><Text style={styles.value}>{report.templateName}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>VERSION</Text><Text style={styles.value}>{report.templateVersion}</Text></View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}><Text style={styles.label}>DRIVER / INSPECTOR</Text><Text style={styles.value}>{report.inspectorName}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>SUBMITTED</Text><Text style={styles.value}>{formatDateTime(report.submittedAt)}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>ODOMETER</Text><Text style={styles.value}>{report.odometer?.toLocaleString("en-US") ?? "Not recorded"}</Text></View>
          </View>
          <View style={{ ...styles.summaryRow, marginBottom: 0 }}>
            <View style={styles.summaryCell}><Text style={styles.label}>VEHICLE DESCRIPTION</Text><Text style={styles.value}>{[report.year, report.make, report.model].filter(Boolean).join(" ") || report.className}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>LICENSE PLATE</Text><Text style={styles.value}>{[report.licenseState, report.licensePlate].filter(Boolean).join(" ") || "Not recorded"}</Text></View>
            <View style={styles.summaryCell}><Text style={styles.label}>VIN</Text><Text style={styles.value}>{report.vin ?? "Not recorded"}</Text></View>
          </View>
        </View>

        <View style={[styles.statusStrip, ...(blocked ? [] : [styles.statusSafe])]} wrap={false}>
          <Text>Severity: {formatEnum(report.severity)}</Text>
          <Text style={[styles.statusValue, ...(blocked ? [] : [styles.statusValueSafe])]}>Disposition: {formatEnum(report.disposition)}</Text>
          <Text>Status: {formatEnum(report.status)}</Text>
        </View>

        {report.defects.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reported Defects</Text>
            {report.defects.map((defect) => (
              <View key={defect.id} style={styles.defect} wrap={false}>
                <Text style={styles.defectTitle}>{formatEnum(defect.severity)} - {defect.title}{defect.blocksDeparture ? " - DEPARTURE BLOCKED" : ""}</Text>
                <Text style={styles.defectText}>{defect.description || "No additional comment."} Status: {formatEnum(defect.status)}.</Text>
              </View>
            ))}
          </View>
        ) : null}

        {report.sections.map((section) => (
          <View key={section.key} style={styles.section} wrap={section.answers.length > 10}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.answers.map((answer) => (
              <View key={answer.id} style={styles.answerRow} wrap={false}>
                <Text style={styles.answerLabel}>{answer.label}</Text>
                <Text style={styles.answerValue}>{displayResponse(answer.response)}</Text>
                <Text style={styles.answerComment}>{answer.comment || (answer.severity !== "none" ? formatEnum(answer.severity) : "")}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerBrand}>Harvey PW Fleet - Controlled system record</Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInspectionPdf(report: InspectionReport): Promise<Buffer> {
  return withReportRenderSlot(() => renderToBuffer(<InspectionDocument report={report} />));
}
