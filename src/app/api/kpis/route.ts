import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

export async function GET(request: NextRequest) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("user_id") ?? user.id;
  const isAll = userId === "all";
  const periodStart = searchParams.get("period_start") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = searchParams.get("period_end") ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  // Fetch all relevant contracts in period
  let contractsQuery = supabase
    .from("contracts")
    .select("id, deal_status, deal_value_eur, mrr_value, qualified_at, demo_booked_at, demo_happened_at, won_at, lost_at, trial_start_at, trial_end_at, created_at")
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd + "T23:59:59");
  if (!isAll) contractsQuery = contractsQuery.eq("owner_id", userId);
  const { data: contracts } = await contractsQuery;

  // Fetch target for this period (no aggregate target for "all")
  let target = null;
  if (!isAll) {
    const { data: targetRows } = await supabase
      .from("sales_targets")
      .select("*")
      .eq("user_id", userId)
      .eq("period_type", "monthly")
      .eq("period_start", periodStart)
      .maybeSingle();
    target = targetRows ?? null;
  }

  const deals = contracts ?? [];

  // Also fetch ALL-TIME contracts for some KPIs
  let allContractsQuery = supabase
    .from("contracts")
    .select("id, deal_status, deal_value_eur, mrr_value, qualified_at, demo_booked_at, demo_happened_at, won_at, lost_at, trial_start_at, trial_end_at, created_at");
  if (!isAll) allContractsQuery = allContractsQuery.eq("owner_id", userId);
  const { data: allContracts } = await allContractsQuery;

  const all = allContracts ?? [];

  // Activities for response time + demo differentiation (all-time, deal-scoped)
  let activitiesQuery = supabase
    .from("activities")
    .select("entity_id, performed_at, type")
    .in("entity_id", all.length > 0 ? all.map(d => d.id) : ["00000000-0000-0000-0000-000000000000"]);
  if (!isAll) activitiesQuery = activitiesQuery.eq("user_id", userId);
  const { data: activitiesData } = await activitiesQuery;

  const activities = activitiesData ?? [];

  // Period activities for calls / meetings KPIs
  let periodActivitiesQuery = supabase
    .from("activities")
    .select("type, performed_at")
    .gte("performed_at", periodStart)
    .lte("performed_at", periodEnd + "T23:59:59");
  if (!isAll) periodActivitiesQuery = periodActivitiesQuery.eq("user_id", userId);
  const { data: periodActivitiesData } = await periodActivitiesQuery;

  const periodActivities = periodActivitiesData ?? [];

  // All-time phone call count (from communications, same source as period counts)
  let allTimePhoneQuery = supabase
    .from("communications")
    .select("id", { count: "exact", head: true })
    .eq("channel", "phone");
  if (!isAll) allTimePhoneQuery = allTimePhoneQuery.eq("created_by", userId);
  const { count: allTimePhoneCount } = await allTimePhoneQuery;

  // ── KPI calculations ──────────────────────────────────────

  // 1. Qualified Leads per Week (in period)
  const qualifiedInPeriod = deals.filter(d => d.qualified_at);
  const periodDays = Math.max(1, (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000);
  const qualifiedPerWeek = (qualifiedInPeriod.length / periodDays) * 7;

  // 2. Lead Response Time (hours to first activity after creation)
  const responseTimes: number[] = [];
  for (const deal of all) {
    const firstActivity = activities
      .filter(a => a.entity_id === deal.id)
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())[0];
    if (firstActivity) {
      const diff = (new Date(firstActivity.performed_at).getTime() - new Date(deal.created_at).getTime()) / 3600000;
      if (diff >= 0) responseTimes.push(diff);
    }
  }
  const avgResponseTimeHours = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null;

  // 3. Demo Booking Rate
  const qualifiedAll = all.filter(d => d.qualified_at).length;
  const demoBookedAll = all.filter(d => d.demo_booked_at).length;
  const demoBookingRate = qualifiedAll > 0 ? demoBookedAll / qualifiedAll : null;

  // 4. Demo Show-Up Rate
  const demoHappenedAll = all.filter(d => d.demo_happened_at).length;
  const demoShowUpRate = demoBookedAll > 0 ? demoHappenedAll / demoBookedAll : null;

  // 5. Demo-to-Customer
  const wonAfterDemo = all.filter(d => d.won_at && d.demo_happened_at).length;
  const demoToCustomer = demoHappenedAll > 0 ? wonAfterDemo / demoHappenedAll : null;

  // 6. Pipeline Coverage Ratio
  const pipelineValue = all.filter(d => !['won','lost','disqualified'].includes(d.deal_status))
    .reduce((sum, d) => sum + (d.deal_value_eur ?? 0), 0);
  const pipelineCoverage = target?.target_revenue_eur ? pipelineValue / target.target_revenue_eur : null;

  // 7. Sales Cycle Length (days from qualified to won)
  const cycleLengths: number[] = all
    .filter(d => d.won_at && d.qualified_at)
    .map(d => (new Date(d.won_at!).getTime() - new Date(d.qualified_at!).getTime()) / 86400000);
  const avgCycleDays = cycleLengths.length > 0 ? cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length : null;

  // 8. Win Rate (Demo → Closed Won)
  const closedAfterDemo = all.filter(d => d.demo_happened_at && (d.won_at || d.lost_at)).length;
  const winRateDemo = closedAfterDemo > 0 ? wonAfterDemo / closedAfterDemo : null;

  // 9. Average Contract Value
  const wonDeals = all.filter(d => d.won_at && d.deal_value_eur);
  const acv = wonDeals.length > 0 ? wonDeals.reduce((sum, d) => sum + (d.deal_value_eur ?? 0), 0) / wonDeals.length : null;

  // 10. MRR New (won in period)
  const wonInPeriod = deals.filter(d => d.won_at);
  const mrrNew = wonInPeriod.reduce((sum, d) => sum + (d.mrr_value ?? 0), 0);

  // 11. Quota Attainment
  const wonRevenue = wonInPeriod.reduce((sum, d) => sum + (d.deal_value_eur ?? 0), 0);
  const quotaAttainment = target?.target_revenue_eur ? wonRevenue / target.target_revenue_eur : null;

  // 12. Time-to-First-Value im Trial (days from trial_start to first activity)
  const trialResponseDays: number[] = all
    .filter(d => d.trial_start_at)
    .map(d => {
      const firstAct = activities.filter(a => a.entity_id === d.id && new Date(a.performed_at) >= new Date(d.trial_start_at!))
        .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())[0];
      if (!firstAct) return null;
      return (new Date(firstAct.performed_at).getTime() - new Date(d.trial_start_at!).getTime()) / 86400000;
    })
    .filter((v): v is number => v !== null);
  const avgTrialFirstValue = trialResponseDays.length > 0 ? trialResponseDays.reduce((a, b) => a + b, 0) / trialResponseDays.length : null;

  // 13. Trial-to-Paid Conversion
  const trialsTotal = all.filter(d => d.trial_start_at).length;
  const trialConverted = all.filter(d => d.trial_start_at && d.won_at).length;
  const trialToPaid = trialsTotal > 0 ? trialConverted / trialsTotal : null;

  // 14. Feature Adoption im Trial (simplified: activities per trial deal)
  const trialDeals = all.filter(d => d.trial_start_at);
  let avgActivitiesPerTrial: number | null = null;
  if (trialDeals.length > 0) {
    const totalActs = trialDeals.reduce((sum, d) => {
      const start = new Date(d.trial_start_at!);
      const end = d.trial_end_at ? new Date(d.trial_end_at) : new Date();
      return sum + activities.filter(a => a.entity_id === d.id && new Date(a.performed_at) >= start && new Date(a.performed_at) <= end).length;
    }, 0);
    avgActivitiesPerTrial = totalActs / trialDeals.length;
  }

  // 15. CAC Payback Period (months = CAC / MRR per customer)
  let cacPaybackMonths: number | null = null;
  if (target?.cac_eur && wonDeals.length > 0) {
    const avgMrr = wonDeals.reduce((sum, d) => sum + (d.mrr_value ?? 0), 0) / wonDeals.length;
    if (avgMrr > 0) cacPaybackMonths = target.cac_eur / avgMrr;
  }

  // Phone duration KPIs (from communications table)
  const yearStart = periodStart.slice(0, 4) + "-01-01";
  const yearEnd   = periodStart.slice(0, 4) + "-12-31";

  // Appointments booked via phone (call_result = 'Termin vereinbart')
  let appointmentsQuery = supabase
    .from("communications")
    .select("id", { count: "exact", head: true })
    .eq("channel", "phone")
    .eq("call_result", "Termin vereinbart")
    .gte("occurred_at", periodStart)
    .lte("occurred_at", periodEnd + "T23:59:59");
  if (!isAll) appointmentsQuery = appointmentsQuery.eq("created_by", userId);
  const { count: appointmentsBookedCount } = await appointmentsQuery;

  // Total phone calls in period (from communications, for appointment rate denominator)
  let totalPhoneCallsQuery = supabase
    .from("communications")
    .select("id", { count: "exact", head: true })
    .eq("channel", "phone")
    .gte("occurred_at", periodStart)
    .lte("occurred_at", periodEnd + "T23:59:59");
  if (!isAll) totalPhoneCallsQuery = totalPhoneCallsQuery.eq("created_by", userId);
  const { count: totalPhoneCallsCount } = await totalPhoneCallsQuery;

  const appointmentsBooked = appointmentsBookedCount ?? 0;
  const totalPhoneCalls = totalPhoneCallsCount ?? 0;
  const appointmentRate = totalPhoneCalls > 0 ? appointmentsBooked / totalPhoneCalls : null;

  let phonePeriodQuery = supabase
    .from("communications")
    .select("duration_seconds")
    .eq("channel", "phone")
    .gte("occurred_at", periodStart)
    .lte("occurred_at", periodEnd + "T23:59:59");
  if (!isAll) phonePeriodQuery = phonePeriodQuery.eq("created_by", userId);
  const { data: phonePeriod } = await phonePeriodQuery;

  let phoneYearQuery = supabase
    .from("communications")
    .select("duration_seconds")
    .eq("channel", "phone")
    .gte("occurred_at", yearStart)
    .lte("occurred_at", yearEnd + "T23:59:59");
  if (!isAll) phoneYearQuery = phoneYearQuery.eq("created_by", userId);
  const { data: phoneYear } = await phoneYearQuery;

  const sumSeconds = (rows: { duration_seconds: number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);

  const phoneSecondsInPeriod = sumSeconds(phonePeriod);
  const phoneSecondsInYear   = sumSeconds(phoneYear);
  const phoneMinutesInPeriod = phoneSecondsInPeriod / 60;
  const phoneMinutesInYear   = phoneSecondsInYear   / 60;

  const phoneMinutesPerDay  = periodDays > 0
    ? Math.round((phoneMinutesInPeriod / periodDays) * 10) / 10
    : 0;
  const phoneMinutesPerWeek = periodDays > 0
    ? Math.round((phoneMinutesInPeriod / periodDays * 7) * 10) / 10
    : 0;
  const phoneHoursMonth = Math.round((phoneMinutesInPeriod / 60) * 10) / 10;
  const phoneHoursYear  = Math.round((phoneMinutesInYear  / 60) * 10) / 10;

  // 16–19. Calls (per day / week / month / total) — sourced from communications table
  const callsPerDay = Math.round((totalPhoneCalls / periodDays) * 10) / 10;
  const callsPerWeek = Math.round((totalPhoneCalls / periodDays * 7) * 10) / 10;
  const callsTotal = allTimePhoneCount ?? 0;

  // 20–21. Meetings: Vor Ort ("meeting") vs. Online ("online_meeting") in period
  const meetingsOnsite = periodActivities.filter(a => a.type === "meeting").length;
  const meetingsOnline = periodActivities.filter(a => a.type === "online_meeting").length;

  // 22–23. Demo-Erscheinungsrate differenziert (activity-based)
  const demoBookedOnlineCount = activities.filter(a => a.type === "demo_booked_online").length;
  const demoBookedOnsiteCount = activities.filter(a => a.type === "demo_booked_onsite").length;
  const demoHappenedOnlineCount = activities.filter(a => a.type === "demo_happened_online").length;
  const demoHappenedOnsiteCount = activities.filter(a => a.type === "demo_happened_onsite").length;
  const demoShowUpRateOnline = demoBookedOnlineCount > 0 ? demoHappenedOnlineCount / demoBookedOnlineCount : null;
  const demoShowUpRateOnsite = demoBookedOnsiteCount > 0 ? demoHappenedOnsiteCount / demoBookedOnsiteCount : null;

  return NextResponse.json({
    period: { start: periodStart, end: periodEnd },
    user_id: userId,
    target,
    kpis: {
      qualifiedLeadsPerWeek: { value: Math.round(qualifiedPerWeek * 10) / 10, raw: qualifiedInPeriod.length },
      leadResponseTimeHours: { value: avgResponseTimeHours ? Math.round(avgResponseTimeHours * 10) / 10 : null },
      demoBookingRate: { value: demoBookingRate, denominator: qualifiedAll, numerator: demoBookedAll },
      demoShowUpRate: { value: demoShowUpRate, denominator: demoBookedAll, numerator: demoHappenedAll },
      demoToCustomer: { value: demoToCustomer, denominator: demoHappenedAll, numerator: wonAfterDemo },
      pipelineCoverage: { value: pipelineCoverage, pipelineValue, targetRevenue: target?.target_revenue_eur ?? null },
      salesCycleDays: { value: avgCycleDays ? Math.round(avgCycleDays) : null },
      winRateDemo: { value: winRateDemo, denominator: closedAfterDemo, numerator: wonAfterDemo },
      acv: { value: acv, wonCount: wonDeals.length },
      mrrNew: { value: mrrNew, wonCount: wonInPeriod.length },
      quotaAttainment: { value: quotaAttainment, wonRevenue, targetRevenue: target?.target_revenue_eur ?? null },
      timeToFirstValueDays: { value: avgTrialFirstValue ? Math.round(avgTrialFirstValue * 10) / 10 : null },
      trialToPaid: { value: trialToPaid, denominator: trialsTotal, numerator: trialConverted },
      featureAdoption: { value: avgActivitiesPerTrial ? Math.round(avgActivitiesPerTrial * 10) / 10 : null, trialCount: trialDeals.length },
      cacPaybackMonths: { value: cacPaybackMonths ? Math.round(cacPaybackMonths * 10) / 10 : null, cac: target?.cac_eur ?? null },
      callsPerDay: { value: callsPerDay, raw: totalPhoneCalls },
      callsPerWeek: { value: callsPerWeek, raw: totalPhoneCalls },
      callsPerMonth: { value: totalPhoneCalls },
      callsTotal: { value: callsTotal },
      meetingsOnsite: { value: meetingsOnsite },
      meetingsOnline: { value: meetingsOnline },
      demoShowUpRateOnline: { value: demoShowUpRateOnline, numerator: demoHappenedOnlineCount, denominator: demoBookedOnlineCount },
      demoShowUpRateOnsite: { value: demoShowUpRateOnsite, numerator: demoHappenedOnsiteCount, denominator: demoBookedOnsiteCount },
      phoneMinutesPerDay:  { value: phoneMinutesPerDay,  raw: phoneMinutesInPeriod },
      phoneMinutesPerWeek: { value: phoneMinutesPerWeek, raw: phoneMinutesInPeriod },
      phoneHoursMonthYear: { value: phoneHoursMonth,     raw: phoneHoursYear },
      appointmentsBooked:  { value: appointmentsBooked, raw: totalPhoneCalls },
      appointmentRate:     { value: appointmentRate, numerator: appointmentsBooked, denominator: totalPhoneCalls },
    },
  });
}
