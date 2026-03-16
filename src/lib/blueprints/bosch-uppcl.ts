import type { ChartType, YAxisConfig } from '@/types/widget'

export const BOSCH_LOGIN_PAYLOAD_KEY = 'mhgj70aizasybty01ob6mfvqoh0fj6rwvjluukcw8mjr04pkjh'

export interface BoschChartBlueprint {
  id: string
  title: string
  sourceType: string
  builderType: ChartType
  endpointPath: string
  dataMapping: {
    xAxis: string
    yAxis?: string
    yAxes?: YAxisConfig[]
    aliases?: Record<string, string>
  }
}

export interface BoschSectionBlueprint {
  id: string
  title: string
  charts: BoschChartBlueprint[]
}

export interface BoschGroupBlueprint {
  id: string
  title: string
  color: string
  sections: BoschSectionBlueprint[]
}

const TWO_SERIES_DEFAULT: YAxisConfig[] = [
  { key: 'primary', color: '#3B82F6' },
  { key: 'secondary', color: '#10B981' },
]

export const BOSCH_UPPCL_BLUEPRINT: BoschGroupBlueprint[] = [
  {
    id: 'communication-status',
    title: 'Communication',
    color: '#10B981',
    sections: [
      {
        id: 'communication-section',
        title: 'Communication Status',
        charts: [
          {
            id: 'meter-installed',
            title: 'Total Installed Meters',
            sourceType: 'pie',
            builderType: 'table',
            endpointPath: 'GetMeterInstalled',
            dataMapping: {
              xAxis: 'consumer_count',
              yAxis: 'dt_count',
              aliases: {
                consumer_count: 'Consumers',
                dt_count: 'DTs',
                feeder_count: 'Feeders',
              },
            },
          },
          {
            id: 'communication-status-gauge',
            title: 'Communicating V/S Non-Communication',
            sourceType: 'gauge',
            builderType: 'gauge',
            endpointPath: 'GetCommunicationStatusMeter',
            dataMapping: {
              xAxis: '',
              yAxis: 'communicating',
              aliases: {
                communicating: 'Communicating',
                non_communicating: 'Non-Communicating',
              },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'disconnection-status',
    title: 'Disconnection',
    color: '#EF4444',
    sections: [
      {
        id: 'disconnection-section',
        title: 'Disconnection Status',
        charts: [
          {
            id: 'connection-status-gauge',
            title: 'Connected vs Disconnected',
            sourceType: 'gauge',
            builderType: 'gauge',
            endpointPath: 'GetConnectionStatus',
            dataMapping: {
              xAxis: '',
              yAxis: 'conn_comm',
              aliases: {
                conn_comm: 'Connected',
                disconn_comm: 'Disconnected',
              },
            },
          },
          {
            id: 'disconnection-aging',
            title: 'Disconnection Ageing',
            sourceType: 'pie',
            builderType: 'pie',
            endpointPath: 'GetDisconnectionAging',
            dataMapping: {
              xAxis: 'disconnected_since',
              yAxis: 'count(9)',
            },
          },
          {
            id: 'disconnection-vs-reconnection',
            title: 'Daily Disconnection vs Reconnection',
            sourceType: 'horizontal-stacked-bar',
            builderType: 'horizontal-stacked-bar',
            endpointPath: 'GetDisconnectionVsReconnection',
            dataMapping: {
              xAxis: 'rc_dc_date',
              yAxis: 'dc_count',
              yAxes: [
                { key: 'dc_count', color: '#EF4444', label: 'Disconnections' },
                { key: 'rc_count', color: '#10B981', label: 'Reconnections' },
              ],
            },
          },
          {
            id: 'aging-disconnected-drilldown-chart',
            title: 'Aging-Wise Disconnected Consumer',
            sourceType: 'drilldown-bar',
            builderType: 'drilldown-bar',
            endpointPath: 'getAgingWiseDisconnectedConsumer',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'count(9)',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'prepaid-billing',
    title: 'Prepaid Billing',
    color: '#F59E0B',
    sections: [
      {
        id: 'prepaid-billing-section',
        title: 'Prepaid Billing',
        charts: [
          {
            id: 'consumer-zones-chart',
            title: 'Prepaid vs Postpaid Consumers',
            sourceType: 'grouped-bar',
            builderType: 'grouped-bar',
            endpointPath: 'getPrepaidVsPostpaidConsumer',
            dataMapping: {
              xAxis: 'zone_name',
              yAxis: 'prepaid_count',
              yAxes: [
                { key: 'prepaid_count', color: '#3B82F6', label: 'Prepaid' },
                { key: 'postpaid_count', color: '#F59E0B', label: 'Postpaid' },
              ],
            },
          },
          {
            id: 'recharge-timeline-chart',
            title: 'Daily Recharge Report',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getDateWiseRechargeCountAndValue',
            dataMapping: {
              xAxis: 'recharge_date',
              yAxis: 'total_recharge_value',
              aliases: {
                total_recharge_value: 'Recharge Value',
                recharge_count: 'Recharge Count',
              },
            },
          },
          {
            id: 'monthly-recharge-chart',
            title: 'Monthly Recharge Report',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getMonthlyRechargeRecieved',
            dataMapping: {
              xAxis: 'recharge_month',
              yAxis: 'total_recharge_amount',
            },
          },
          {
            id: 'negative-balance-breakdown-chart',
            title: 'Consumer Balance Breakdown',
            sourceType: 'horizontal-stacked-bar',
            builderType: 'horizontal-stacked-bar',
            endpointPath: 'getCircleWiseConsumerWithNegativeBalance',
            dataMapping: {
              xAxis: 'circle_name',
              yAxis: 'consumer_count',
            },
          },
          {
            id: 'negative-balance-chart',
            title: 'Negative Balances Distribution',
            sourceType: 'horizontal-stacked-bar',
            builderType: 'horizontal-stacked-bar',
            endpointPath: 'getNegativeBalanceWiseConsumerCount',
            dataMapping: {
              xAxis: 'circle_name',
              yAxis: 'consumer_count',
            },
          },
          {
            id: 'aging-negative-balance-chart',
            title: 'Aging Wise Negative Balance',
            sourceType: 'horizontal-stacked-bar',
            builderType: 'horizontal-stacked-bar',
            endpointPath: 'getAgingWiseNegativeBalanceConsumerCount',
            dataMapping: {
              xAxis: 'circle_name',
              yAxis: 'consumer_count',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'net-metering',
    title: 'Net Metering',
    color: '#06B6D4',
    sections: [
      {
        id: 'net-metering-section',
        title: 'Net Metering Insights',
        charts: [
          {
            id: 'net-metering-bar',
            title: 'Month-wise Conversion to Net Metering',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'netMeteringCon',
            dataMapping: {
              xAxis: 'month_year',
              yAxis: 'count',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'power-quality',
    title: 'Power Quality',
    color: '#8B5CF6',
    sections: [
      {
        id: 'power-quality-section',
        title: 'Power Quality Insights',
        charts: [
          {
            id: 'monthly-pf',
            title: 'PF Status',
            sourceType: 'pie',
            builderType: 'pie',
            endpointPath: 'GetPF',
            dataMapping: {
              xAxis: 'pf_cat',
              yAxis: 'count(9)',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'best-worst-feeders',
    title: 'Feeders',
    color: '#14B8A6',
    sections: [
      {
        id: 'feeders-meter-count',
        title: 'Feeders Meters Count',
        charts: [
          {
            id: 'feeder-consumer-count',
            title: 'Feeders Wise Consumer Count',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getFeederWiseConsumerCount',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'consumer_count',
            },
          },
        ],
      },
      {
        id: 'meters-billing-availability',
        title: 'Monthly Billing Reads',
        charts: [
          {
            id: 'feeder-billing-top10',
            title: 'Top 10 Feeders - Monthly Billing Reads',
            sourceType: 'horizontal-bar',
            builderType: 'horizontal-bar',
            endpointPath: 'getFeederWiseMonthlyBillingDataTop10',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'monthly_billing_count',
            },
          },
          {
            id: 'feeder-billing-bottom10',
            title: 'Bottom 10 Feeders - Monthly Billing Reads',
            sourceType: 'horizontal-bar',
            builderType: 'horizontal-bar',
            endpointPath: 'getFeederWiseMonthlyBillingDataBottom10',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'monthly_billing_count',
            },
          },
          {
            id: 'feeder-monthly-billing-chart',
            title: 'Feeder-wise Monthly Billing',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getFeederWiseMonthlyBillingData',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'monthly_billing_count',
              yAxes: [
                { key: 'monthly_billing_count', color: '#3B82F6', label: 'Billed' },
                { key: 'total_consumer_count', color: '#10B981', label: 'Total' },
              ],
            },
          },
        ],
      },
      {
        id: 'feeder-disconnect-meters',
        title: 'Disconnected Meters',
        charts: [
          {
            id: 'feeder-disconnected-top10',
            title: 'Top 10 Feeders - Disconnected Meters',
            sourceType: 'horizontal-bar',
            builderType: 'horizontal-bar',
            endpointPath: 'getFeederWiseDisconnectedConsumerTop10',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'disconnected_consumer_count',
            },
          },
          {
            id: 'feeder-disconnected-bottom10',
            title: 'Bottom 10 Feeders - Disconnected Meters',
            sourceType: 'horizontal-bar',
            builderType: 'horizontal-bar',
            endpointPath: 'getFeederWiseDisconnectedConsumerBottom10',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'disconnected_consumer_count',
            },
          },
          {
            id: 'feeder-disconnected-chart',
            title: 'Feeder-wise Disconnected Consumers',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getFeederWiseDisconnectedConsumer',
            dataMapping: {
              xAxis: 'feeder',
              yAxis: 'disconnected_consumer_count',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'additional-charts',
    title: 'Analytics',
    color: '#6366F1',
    sections: [
      {
        id: 'feeder-analysis',
        title: 'Feeder Analysis',
        charts: [
          {
            id: 'dtr-consumer-count',
            title: 'DTR-wise Consumer Count',
            sourceType: 'bar',
            builderType: 'bar',
            endpointPath: 'getDTRWiseConsumerCount',
            dataMapping: {
              xAxis: 'dt',
              yAxis: 'consumer_count',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'consumer-meter-group',
    title: 'Consumer Meter',
    color: '#f873b6',
    sections: [
      {
        id: 'meter-overview-group',
        title: 'Meter Overview Statistics',
        charts: [
          {
            id: 'meter-overview-chart',
            title: 'Meter Overview Statistics',
            sourceType: 'meter-group',
            builderType: 'status-card',
            endpointPath: 'ConMeter_TotalCount',
            dataMapping: {
              xAxis: '',
              yAxis: 'total_cnt',
            },
          },
        ],
      },
      {
        id: 'meter-availability-section',
        title: 'Availability Status',
        charts: [
          {
            id: 'con-meter-current-month',
            title: 'Current Month Availability',
            sourceType: 'ring-gauge',
            builderType: 'ring-gauge',
            endpointPath: 'ConMeter_CurrentMonthCount',
            dataMapping: {
              xAxis: '',
              yAxis: 'total_percent',
            },
          },
          {
            id: 'con-meter-daily-count',
            title: 'Daily Availability',
            sourceType: 'ring-gauge',
            builderType: 'ring-gauge',
            endpointPath: 'ConMeter_DailyCount',
            dataMapping: {
              xAxis: '',
              yAxis: 'total_percent',
            },
          },
          {
            id: 'con-meter-block-current',
            title: 'Current Block Availability',
            sourceType: 'ring-gauge',
            builderType: 'ring-gauge',
            endpointPath: 'ConMeter_BlockCount_Current',
            dataMapping: {
              xAxis: '',
              yAxis: 'total_percent',
            },
          },
        ],
      },
      {
        id: 'meter-trends-section',
        title: 'Growth & Trends',
        charts: [
          {
            id: 'con-meter-count-trend',
            title: 'Installation Growth (7 Days)',
            sourceType: 'grouped-bar',
            builderType: 'grouped-bar',
            endpointPath: 'ConMeter_MeterCount',
            dataMapping: {
              xAxis: 'mtr_install_date',
              yAxis: 'tot_daily_meter_cnt',
              yAxes: [
                { key: 'tot_daily_meter_cnt', color: '#8B5CF6', label: 'Daily Added' },
                { key: 'tot_meter_cnt', color: '#10B981', label: 'Total Meters' },
              ],
            },
          },
          {
            id: 'con-meter-previous-daily-trend',
            title: 'Historical Availability Trend',
            sourceType: 'trend-composed',
            builderType: 'line',
            endpointPath: 'ConMeter_PrevousDailyCount',
            dataMapping: {
              xAxis: 'rtc_date',
              yAxis: 'total_percent',
            },
          },
        ],
      },
      {
        id: 'meter-interval-availability',
        title: 'Block Load Availability',
        charts: [
          {
            id: 'ConMeter-BlockLoad-Availity',
            title: 'Block Load Profile (Interval data) Availability',
            sourceType: 'block-load-list',
            builderType: 'table',
            endpointPath: 'ConMeter_BlockLoad_Availity',
            dataMapping: {
              xAxis: 'rtc_date',
              yAxis: 'total_percent',
            },
          },
        ],
      },
    ],
  },
]

export interface BoschEndpointPreset {
  key: string
  name: string
  path: string
}

const BOSCH_UPPCL_EXTRA_ENDPOINTS: BoschEndpointPreset[] = [
  {
    key: 'feeder-non-comm-chart',
    name: 'Feeder Wise Non-Communicating Meters',
    path: 'getFeederWiseNonCommMeter',
  },
  {
    key: 'outage-fdr-count',
    name: 'Outage Count FDR',
    path: 'outageCountFDR',
  },
  {
    key: 'outage-dtr-count',
    name: 'Outage Count DTR',
    path: 'outageCountDTR',
  },
  {
    key: 'realTimeFeedeONOFStatus',
    name: 'Real Time Feeder On & Off',
    path: 'realTimeFeedeONOFStatus',
  },
  {
    key: 'realTimeFeedeOutageStatus',
    name: 'Real Time Feeder Outage Status',
    path: 'realTimeFeedeOutageStatus',
  },
  {
    key: 'con-meter-block-previous',
    name: 'Previous Block Trend',
    path: 'ConMeter_BlockCount_Previous',
  },
  {
    key: 'con-meter-hhu-count',
    name: 'HHU Count',
    path: 'ConMeter_HHUCount',
  },
  {
    key: 'con-meter-month-count',
    name: 'Month Count',
    path: 'ConMeter_MonthCount',
  },
]

export const BOSCH_UPPCL_ENDPOINTS: BoschEndpointPreset[] = Array.from(
  [...BOSCH_UPPCL_BLUEPRINT
    .flatMap(group => group.sections)
    .flatMap(section => section.charts)
    .map(chart => ({
      key: chart.id,
      name: chart.title,
      path: chart.endpointPath,
    })), ...BOSCH_UPPCL_EXTRA_ENDPOINTS]
    .reduce((map, endpoint) => {
      if (!map.has(endpoint.path)) {
        map.set(endpoint.path, endpoint)
      }
      return map
    }, new Map<string, BoschEndpointPreset>())
    .values(),
)

export interface BoschChartInventoryRow {
  group: string
  subgroup: string
  chartId: string
  chartTitle: string
  sourceType: string
  builderType: ChartType
  endpointPath: string
}

export const BOSCH_UPPCL_CHART_INVENTORY: BoschChartInventoryRow[] = BOSCH_UPPCL_BLUEPRINT.flatMap(
  group => group.sections.flatMap(
    section => section.charts.map(chart => ({
      group: group.title,
      subgroup: section.title,
      chartId: chart.id,
      chartTitle: chart.title,
      sourceType: chart.sourceType,
      builderType: chart.builderType,
      endpointPath: chart.endpointPath,
    })),
  ),
)

export const BOSCH_UPPCL_BLUEPRINT_STATS = {
  groups: BOSCH_UPPCL_BLUEPRINT.length,
  subgroups: BOSCH_UPPCL_BLUEPRINT.reduce((sum, group) => sum + group.sections.length, 0),
  charts: BOSCH_UPPCL_CHART_INVENTORY.length,
  endpoints: BOSCH_UPPCL_ENDPOINTS.length,
}

export const BOSCH_UPPCL_DEFAULT_PROJECT = {
  dashboardName: 'UPPCL MDM Overview',
  description: 'Bosch blueprint with Group → Subgroup navigation and PDF-ready widget map',
}

export const DEFAULT_MULTI_SERIES = TWO_SERIES_DEFAULT
