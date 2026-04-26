import { Router, Request, Response } from 'express';
import db from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest, ChargingSession } from '../types';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const router = Router();
router.use(authenticate);

/**
 * GET /export/excel
 * Export user's charging sessions, charger costs, and summary to Excel workbook
 */
router.get('/excel', async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    // Fetch user data
    const user = db.prepare('SELECT licence_plate, display_name FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Fetch all sessions with vehicle info
    const sessions = db
      .prepare(
        `SELECT cs.*, v.licence_plate as vehicle_plate, v.nickname as vehicle_nickname
         FROM charging_sessions cs
         LEFT JOIN vehicles v ON cs.vehicle_id = v.id
         WHERE cs.user_id = ?
         ORDER BY cs.date_unplugged DESC`
      )
      .all(userId) as any[];

    // Fetch all charger costs
    const chargerCosts = db
      .prepare(
        `SELECT cc.*, cs.date_unplugged
         FROM charger_costs cc
         JOIN charging_sessions cs ON cc.session_id = cs.id
         WHERE cc.user_id = ?
         ORDER BY cs.date_unplugged DESC`
      )
      .all(userId) as any[];

    // Calculate summary statistics
    const totalSessions = sessions.length;
    const totalEnergyKwh = chargerCosts.reduce((sum, cc) => sum + cc.energy_kwh, 0);
    const totalCostPence = chargerCosts.reduce((sum, cc) => sum + cc.price_pence, 0);
    const avgBatteryGain = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.final_battery_pct - s.initial_battery_pct), 0) / sessions.length
      : 0;

    // Create workbook
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Charging Sessions
    const sessionsSheet = workbook.addWorksheet('Charging Sessions');
    sessionsSheet.columns = [
      { header: 'Date', key: 'date_unplugged', width: 15 },
      { header: 'Odometer (mi)', key: 'odometer_miles', width: 15 },
      { header: 'Vehicle', key: 'vehicle_plate', width: 15 },
      { header: 'Init Battery %', key: 'initial_battery_pct', width: 15 },
      { header: 'Final Battery %', key: 'final_battery_pct', width: 15 },
      { header: 'Init Range (mi)', key: 'initial_range_miles', width: 15 },
      { header: 'Final Range (mi)', key: 'final_range_miles', width: 15 },
      { header: 'Air Temp (°C)', key: 'air_temp_celsius', width: 15 },
    ];

    sessions.forEach((session) => {
      sessionsSheet.addRow({
        date_unplugged: session.date_unplugged,
        odometer_miles: session.odometer_miles.toFixed(2),
        vehicle_plate: session.vehicle_plate || '-',
        initial_battery_pct: session.initial_battery_pct.toFixed(1),
        final_battery_pct: session.final_battery_pct.toFixed(1),
        initial_range_miles: session.initial_range_miles.toFixed(2),
        final_range_miles: session.final_range_miles.toFixed(2),
        air_temp_celsius: session.air_temp_celsius.toFixed(1),
      });
    });

    sessionsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sessionsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

    // Sheet 2: Charger Costs
    const costsSheet = workbook.addWorksheet('Charger Costs');
    costsSheet.columns = [
      { header: 'Date', key: 'date_unplugged', width: 15 },
      { header: 'Energy (kWh)', key: 'energy_kwh', width: 15 },
      { header: 'Cost (£)', key: 'cost_pounds', width: 15 },
      { header: 'Charger Type', key: 'charger_type', width: 15 },
      { header: 'Charger Name', key: 'charger_name', width: 20 },
    ];

    chargerCosts.forEach((cost) => {
      costsSheet.addRow({
        date_unplugged: cost.date_unplugged,
        energy_kwh: cost.energy_kwh.toFixed(2),
        cost_pounds: (cost.price_pence / 100).toFixed(2),
        charger_type: cost.charger_type,
        charger_name: cost.charger_name || '-',
      });
    });

    costsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    costsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

    // Sheet 3: Summary
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 30 }];

    const exportDate = new Date().toISOString().split('T')[0];
    summarySheet.addRow({ metric: 'Export Date', value: exportDate });
    summarySheet.addRow({ metric: 'Licence Plate', value: user.licence_plate });
    summarySheet.addRow({ metric: 'Display Name', value: user.display_name || '-' });
    summarySheet.addRow({ metric: '', value: '' });
    summarySheet.addRow({ metric: 'Total Charging Sessions', value: totalSessions });
    summarySheet.addRow({ metric: 'Total Energy (kWh)', value: totalEnergyKwh.toFixed(2) });
    summarySheet.addRow({ metric: 'Total Cost (£)', value: (totalCostPence / 100).toFixed(2) });
    summarySheet.addRow({ metric: 'Average Battery Gain (%)', value: avgBatteryGain.toFixed(1) });

    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(5).font = { bold: true };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Leccy_Export_${user.licence_plate}_${exportDate}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[export/excel]', err);
    res.status(500).json({ error: 'Failed to generate Excel export' });
  }
});

/**
 * GET /export/pdf
 * Export user's charging sessions summary to PDF
 */
router.get('/pdf', (req: Request, res: Response): void => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;

    // Fetch user data
    const user = db.prepare('SELECT licence_plate, display_name FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Fetch sessions
    const sessions = db
      .prepare(
        `SELECT cs.*, v.licence_plate as vehicle_plate
         FROM charging_sessions cs
         LEFT JOIN vehicles v ON cs.vehicle_id = v.id
         WHERE cs.user_id = ?
         ORDER BY cs.date_unplugged DESC
         LIMIT 100`
      )
      .all(userId) as any[];

    // Fetch charger costs
    const chargerCosts = db
      .prepare(
        `SELECT cc.* FROM charger_costs cc
         WHERE cc.user_id = ?
         ORDER BY cc.created_at DESC
         LIMIT 100`
      )
      .all(userId) as any[];

    const doc = new PDFDocument();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Leccy_Export_${user.licence_plate}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Leccy Data Export', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Licence Plate: ${user.licence_plate}`, { align: 'center' });
    doc.fontSize(10).text(`Exported: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown();

    // Summary section
    doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics');
    const totalEnergy = chargerCosts.reduce((sum, cc) => sum + cc.energy_kwh, 0);
    const totalCost = chargerCosts.reduce((sum, cc) => sum + cc.price_pence, 0);
    const avgBattery = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.final_battery_pct - s.initial_battery_pct), 0) / sessions.length
      : 0;

    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Sessions: ${sessions.length}`);
    doc.text(`Total Energy: ${totalEnergy.toFixed(2)} kWh`);
    doc.text(`Total Cost: £${(totalCost / 100).toFixed(2)}`);
    doc.text(`Avg Battery Gain: ${avgBattery.toFixed(1)}%`);
    doc.moveDown();

    // Recent sessions table
    if (sessions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Recent Charging Sessions (up to 100)');
      doc.moveDown(0.5);

      // Table headers
      const tableX = 50;
      const colWidths = [80, 80, 90, 90];
      const headers = ['Date', 'Odometer', 'Init Battery', 'Final Battery'];

      doc.fontSize(10).font('Helvetica-Bold');
      let x = tableX;
      headers.forEach((header, i) => {
        doc.text(header, x, doc.y, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      doc.moveTo(tableX, doc.y + 5).lineTo(tableX + colWidths.reduce((a, b) => a + b), doc.y + 5).stroke();
      doc.moveDown(0.5);

      // Table rows
      doc.fontSize(9).font('Helvetica');
      sessions.slice(0, 50).forEach((session) => {
        x = tableX;
        doc.text(session.date_unplugged, x, doc.y, { width: colWidths[0], align: 'center' });
        doc.text(session.odometer_miles.toFixed(0), x + colWidths[0], doc.y, { width: colWidths[1], align: 'center' });
        doc.text(`${session.initial_battery_pct.toFixed(0)}%`, x + colWidths[0] + colWidths[1], doc.y, {
          width: colWidths[2],
          align: 'center',
        });
        doc.text(`${session.final_battery_pct.toFixed(0)}%`, x + colWidths[0] + colWidths[1] + colWidths[2], doc.y, {
          width: colWidths[3],
          align: 'center',
        });
        doc.moveDown(0.8);
      });
    }

    doc.end();
  } catch (err) {
    console.error('[export/pdf]', err);
    res.status(500).json({ error: 'Failed to generate PDF export' });
  }
});

export default router;
