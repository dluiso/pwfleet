import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getEnvironment } from "@/lib/env";
import { formatDateTime, formatEnum } from "@/lib/format";
import type { getFleetOperationalReport } from "./fleet-report";
import { withReportRenderSlot } from "./render-admission";

type Report = Awaited<ReturnType<typeof getFleetOperationalReport>>;

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Helvetica", fontSize: 7, color: "#17211e" },
  brand: { color: "#1d775e", fontSize: 7, letterSpacing: 1 },
  title: { marginTop: 4, fontFamily: "Helvetica-Bold", fontSize: 17, color: "#123f36" },
  subtitle: { marginTop: 3, color: "#5d6d68" },
  warning: { marginTop: 7, color: "#a23732" },
  metrics: { marginTop: 12, flexDirection: "row", gap: 5 },
  metric: { flexGrow: 1, flexBasis: 0, padding: 7, borderWidth: 1, borderColor: "#d9e1de", borderRadius: 3 },
  metricLabel: { color: "#5d6d68", fontSize: 5.5 },
  metricValue: { marginTop: 2, fontFamily: "Helvetica-Bold", fontSize: 9 },
  table: { marginTop: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d9e1de", paddingVertical: 4 },
  header: { backgroundColor: "#123f36", color: "#fff", fontFamily: "Helvetica-Bold", paddingHorizontal: 3 },
  vehicle: { width: "12%", paddingHorizontal: 3 },
  date: { width: "14%", paddingHorizontal: 3 },
  form: { width: "20%", paddingHorizontal: 3 },
  driver: { width: "15%", paddingHorizontal: 3 },
  status: { width: "13%", paddingHorizontal: 3 },
  defects: { width: "9%", paddingHorizontal: 3 },
  maintenance: { width: "17%", paddingHorizontal: 3 },
  footer: { position: "absolute", bottom: 15, left: 30, right: 30, color: "#5d6d68", fontSize: 5.5, flexDirection: "row", justifyContent: "space-between" },
});

function FleetReportDocument({ report }: { report: Report }) {
  const detailLimit = getEnvironment().REPORT_PDF_DETAIL_ROW_LIMIT;
  const detailRows = report.rows.slice(0, detailLimit);
  const metrics = [
    ["Inspections", report.totals.inspections],
    ["Critical", report.totals.critical],
    ["Blocking", report.totals.blocked],
    ["Open defects", report.totals.openDefects],
    ["Cost", (report.totals.maintenanceCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })],
    ["Labor hours", (report.totals.laborMinutes / 60).toFixed(1)],
  ];
  return (
    <Document title="Fleet operational report" author="City of Harvey Public Works">
      <Page size="LETTER" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.brand}>CITY OF HARVEY - PUBLIC WORKS</Text>
        <Text style={styles.title}>Fleet Operational Report</Text>
        <Text style={styles.subtitle}>{report.filters.from} through {report.filters.to} · {report.timeZone} · Generated {formatDateTime(report.generatedAt)} · Filters {JSON.stringify(report.filters)}</Text>
        <View style={styles.metrics}>
          {metrics.map(([label, value]) => <View style={styles.metric} key={String(label)}><Text style={styles.metricLabel}>{String(label).toUpperCase()}</Text><Text style={styles.metricValue}>{String(value)}</Text></View>)}
        </View>
        {report.truncated || report.rows.length > detailLimit ? <Text style={styles.warning}>Detail output was capped at {detailRows.length.toLocaleString("en-US")} rows. Totals reflect only rows loaded within the configured report cap; narrow filters for complete reconciliation.</Text> : null}
        <View style={styles.table}>
          <View style={[styles.row, styles.header]} fixed><Text style={styles.vehicle}>Vehicle</Text><Text style={styles.date}>Submitted</Text><Text style={styles.form}>Form</Text><Text style={styles.driver}>Driver</Text><Text style={styles.status}>Outcome</Text><Text style={styles.defects}>Defects</Text><Text style={styles.maintenance}>Maintenance</Text></View>
          {detailRows.map((row) => (
            <View style={styles.row} key={row.inspectionId} wrap={false}>
              <Text style={styles.vehicle}>{row.displayCode ?? `Unit ${row.unitNumber}`}\n{row.classCode}</Text>
              <Text style={styles.date}>{formatDateTime(row.submittedAt)}\n{row.inspectionId.slice(0, 8)}</Text>
              <Text style={styles.form}>{row.templateName}\nv{row.templateVersion}</Text>
              <Text style={styles.driver}>{row.inspectorName}</Text>
              <Text style={styles.status}>{formatEnum(row.severity)}\n{formatEnum(row.disposition)}</Text>
              <Text style={styles.defects}>{row.openDefectCount} open\n{row.blockingDefectCount} blocking</Text>
              <Text style={styles.maintenance}>{row.maintenanceStatus ? formatEnum(row.maintenanceStatus) : "No case"}\n{(row.maintenanceCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · {row.laborMinutes} min</Text>
            </View>
          ))}
        </View>
        <View style={styles.footer} fixed><Text>Harvey PW Fleet · Controlled report</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}

export async function renderFleetOperationalPdf(report: Report) {
  return withReportRenderSlot(() => renderToBuffer(<FleetReportDocument report={report} />));
}
