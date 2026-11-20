import { useRef, useState } from 'react';
import { BarChart3, Download, Sparkles } from 'lucide-react';
import { safeFileName, saveBlob, stripHashMarks, svgToPngDataUrl } from '../utils/mediaExport';

interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

interface GeneratedChartData {
  chartTitle: string;
  chartType: 'bar' | 'line' | 'pie' | 'area';
  unit: string;
  labels: string[];
  series: ChartSeries[];
  insights: string[];
}

interface Props {
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

export function SmartChartsPanel({ geminiMode = 'balanced' }: Props) {
  const [prompt, setPrompt] = useState('');
  const [preferredType, setPreferredType] = useState<'auto' | 'bar' | 'line' | 'pie' | 'area'>('auto');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [chart, setChart] = useState<GeneratedChartData | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  async function generateChart(overridePrompt?: string) {
    const text = (overridePrompt ?? prompt).trim();
    if (!text) {
      setStatusMsg('اكتبي الأرقام أو المقارنة أو الموضوع المطلوب تمثيله برسم بياني أولاً.');
      return;
    }
    setLoading(true);
    setStatusMsg('جاري تحليل البيانات وتصميم الرسم البياني…');
    try {
      const r = await fetch('/api/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, chartType: preferredType, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر إنشاء الرسم البياني.');
      if (data.rejected) {
        setStatusMsg(data.message || 'هذه الأيقونة مخصصة حصراً للرسوم البيانية.');
        return;
      }
      if (data.chart) {
        setChart(data.chart as GeneratedChartData);
        setHoveredIdx(null);
        setStatusMsg('');
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'حدث خطأ أثناء إنشاء الرسم البياني.');
    } finally {
      setLoading(false);
    }
  }

  function downloadSvg() {
    if (!svgRef.current || !chart) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    saveBlob(blob, `${safeFileName(chart.chartTitle)}.svg`);
  }

  async function downloadPng() {
    if (!svgRef.current || !chart) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const pngDataUrl = await svgToPngDataUrl(xml, 1200);
    const resp = await fetch(pngDataUrl);
    const blob = await resp.blob();
    saveBlob(blob, `${safeFileName(chart.chartTitle)}.png`);
  }

  function downloadCsv() {
    if (!chart) return;
    const headers = ['البند', ...chart.series.map((s) => s.name)];
    const rows = chart.labels.map((label, i) => [label, ...chart.series.map((s) => String(s.values[i] ?? 0))]);
    const csv =
      '\ufeff' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeFileName(chart.chartTitle)}.csv`);
  }

  const activeType = chart
    ? preferredType === 'auto'
      ? chart.chartType
      : preferredType
    : preferredType;

  return (
    <div className="charts-panel-shell">
      <div className="char-sender-box">
        <div className="tiny" style={{ marginBottom: 8 }}>
          أمثلة سريعة لرسم أي بيانات أو مقارنات (مخصصة للرسوم البيانية فقط):
        </div>
        <div className="history-chips" style={{ marginBottom: 10 }}>
          {[
            'مبيعات متجر خلال 6 أشهر: يناير 12000، فبراير 15500، مارس 14200، أبريل 19800، مايو 24000، يونيو 27500',
            'توزيع مصاريفي الشهرية: سكن 35%، طعام 25%، مواصلات 15%، فواتير 10%، ادخار 15%',
            'مقارنة درجات الطالب في المواد: الرياضيات 95، العلوم 88، العربية 92، الإنجليزية 85، الحاسوب 98',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              className="history-chip"
              disabled={loading}
              onClick={() => {
                setPrompt(preset);
                void generateChart(preset);
              }}
            >
              {preset.slice(0, 52)}…
            </button>
          ))}
        </div>

        <textarea
          className="field"
          style={{ minHeight: 96, marginTop: 4 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="أدخلي الأرقام والبيانات أو اطلبي رسماً بيانياً لمقارنة أو موضوع إحصائي (مثال: مصاريف المشروع أو مقارنة أداء الأعوام)..."
        />

        <div className="toolrow">
          <select
            className="field"
            style={{ width: 'auto', minWidth: 185, margin: 0 }}
            value={preferredType}
            onChange={(e) => setPreferredType(e.target.value as 'auto' | 'bar' | 'line' | 'pie' | 'area')}
          >
            <option value="auto">نوع الرسم: تلقائي ذكي</option>
            <option value="bar">أعمدة (Bar Chart)</option>
            <option value="line">خطي (Line Chart)</option>
            <option value="area">مساحي (Area Chart)</option>
            <option value="pie">دائري (Pie Chart)</option>
          </select>

          <button
            type="button"
            className="primary"
            disabled={loading}
            onClick={() => void generateChart()}
          >
            <Sparkles size={15} />
            {loading ? 'جاري إنشاء الرسم…' : 'إنشاء الرسم البياني'}
          </button>
        </div>
      </div>

      {statusMsg && <div className="statusbox info">{statusMsg}</div>}

      {chart && (
        <div className="chart-stage-card">
          <div className="wb-row-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong style={{ fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={18} color="#38bdf8" />
                {stripHashMarks(chart.chartTitle)}
              </strong>
              {chart.unit && <div className="tiny">الوحدة: {chart.unit}</div>}
            </div>
            <div className="msg-actions">
              <button type="button" className="mini-btn" onClick={() => void downloadPng()}>
                <Download size={12} />
                تنزيل PNG
              </button>
              <button type="button" className="mini-btn" onClick={downloadSvg}>
                <Download size={12} />
                تنزيل SVG
              </button>
              <button type="button" className="mini-btn" onClick={downloadCsv}>
                <Download size={12} />
                بيانات CSV
              </button>
            </div>
          </div>

          <div className="chart-svg-wrap">
            {renderChartSvg(chart, activeType === 'auto' ? chart.chartType : activeType, svgRef, hoveredIdx, setHoveredIdx)}
          </div>

          <div className="chart-legend">
            {chart.series.map((s) => (
              <span key={s.name} className="chart-legend-item">
                <span className="chart-swatch" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>

          {hoveredIdx !== null && chart.labels[hoveredIdx] && (
            <div className="statusbox info" style={{ marginTop: 10 }}>
              <strong>{chart.labels[hoveredIdx]}:</strong>{' '}
              {chart.series.map((s) => `${s.name}: ${s.values[hoveredIdx] ?? 0} ${chart.unit}`).join(' | ')}
            </div>
          )}

          {chart.insights.length > 0 && (
            <div className="chart-insights-box">
              <strong style={{ fontSize: 13, color: '#67e8f9' }}>قراءة وتحليل البيانات:</strong>
              <ul>
                {chart.insights.map((ins, i) => (
                  <li key={i}>{ins}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderChartSvg(
  chart: GeneratedChartData,
  type: 'bar' | 'line' | 'pie' | 'area',
  svgRef: React.RefObject<SVGSVGElement | null>,
  hoveredIdx: number | null,
  setHoveredIdx: (idx: number | null) => void,
) {
  const W = 760;
  const H = 380;
  const labels = chart.labels.length > 0 ? chart.labels : ['—'];
  const series = chart.series.length > 0 ? chart.series : [{ name: 'القيمة', color: '#38bdf8', values: [0] }];

  if (type === 'pie') {
    const firstSeries = series[0];
    const piePalette = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#2dd4bf', '#818cf8'];
    const values = labels.map((_, i) => Math.max(0, firstSeries.values[i] ?? 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 240;
    const cy = 190;
    const r = 132;
    const innerR = 58;
    let angle = -Math.PI / 2;

    const slices = values.map((val, i) => {
      const sliceAngle = (val / total) * Math.PI * 2;
      const start = angle;
      const end = angle + sliceAngle;
      angle = end;
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const ix1 = cx + innerR * Math.cos(end);
      const iy1 = cy + innerR * Math.sin(end);
      const ix2 = cx + innerR * Math.cos(start);
      const iy2 = cy + innerR * Math.sin(start);
      const d = [
        `M ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
        'Z',
      ].join(' ');
      const pct = Math.round((val / total) * 100);
      return { d, color: piePalette[i % piePalette.length], label: labels[i], val, pct };
    });

    return (
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="chart-svg-canvas">
        <rect width={W} height={H} rx={16} fill="#0b0c1c" />
        <text x={W / 2} y={28} textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700" fontFamily="Tahoma, Arial">
          {chart.chartTitle}
        </text>
        {slices.map((sl, i) => (
          <path
            key={i}
            d={sl.d}
            fill={sl.color}
            opacity={hoveredIdx === null || hoveredIdx === i ? 0.95 : 0.45}
            stroke="#0b0c1c"
            strokeWidth={2}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
          />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="700" fontFamily="Tahoma, Arial">
          {hoveredIdx !== null && slices[hoveredIdx] ? `${slices[hoveredIdx].pct}%` : '100%'}
        </text>
        {slices.map((sl, i) => (
          <g key={i} transform={`translate(430, ${66 + i * 28})`} onMouseEnter={() => setHoveredIdx(i)} style={{ cursor: 'pointer' }}>
            <rect width={12} height={12} rx={3} fill={sl.color} y={-10} />
            <text x={20} y={0} fill="#e2e8f0" fontSize="12" fontFamily="Tahoma, Arial">
              {sl.label} ({sl.val} {chart.unit} · {sl.pct}%)
            </text>
          </g>
        ))}
      </svg>
    );
  }

  const padL = 62;
  const padR = 28;
  const padT = 46;
  const padB = 64;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = series.flatMap((s) => s.values);
  const rawMax = Math.max(10, ...allVals);
  const maxVal = Math.ceil(rawMax * 1.12);
  const ticks = 4;

  const xFor = (i: number) =>
    labels.length === 1 ? padL + plotW / 2 : padL + (i / (labels.length - 1)) * plotW;
  const yFor = (val: number) => padT + plotH - (Math.max(0, val) / maxVal) * plotH;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="chart-svg-canvas">
      <rect width={W} height={H} rx={16} fill="#0b0c1c" />
      <text x={W / 2} y={26} textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700" fontFamily="Tahoma, Arial">
        {chart.chartTitle}
      </text>

      {Array.from({ length: ticks + 1 }).map((_, idx) => {
        const val = Math.round((maxVal / ticks) * idx);
        const y = yFor(val);
        return (
          <g key={idx}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#232548" strokeDasharray="4 4" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11" fontFamily="Tahoma, Arial">
              {val}
            </text>
          </g>
        );
      })}

      {type === 'bar' &&
        labels.map((label, i) => {
          const groupW = plotW / labels.length;
          const barW = Math.min(38, Math.max(12, (groupW * 0.72) / series.length));
          const groupStart = padL + i * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
              {series.map((s, si) => {
                const v = Math.max(0, s.values[i] ?? 0);
                const y = yFor(v);
                const h = Math.max(2, padT + plotH - y);
                const x = groupStart + si * barW;
                return (
                  <g key={si}>
                    <rect
                      x={x}
                      y={y}
                      width={barW - 2}
                      height={h}
                      rx={5}
                      fill={s.color}
                      opacity={hoveredIdx === null || hoveredIdx === i ? 0.92 : 0.45}
                    />
                    <text
                      x={x + (barW - 2) / 2}
                      y={y - 6}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="10"
                      fontFamily="Tahoma, Arial"
                    >
                      {v}
                    </text>
                  </g>
                );
              })}
              <text
                x={padL + i * groupW + groupW / 2}
                y={H - 28}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="11"
                fontFamily="Tahoma, Arial"
              >
                {label.length > 14 ? `${label.slice(0, 12)}…` : label}
              </text>
            </g>
          );
        })}

      {(type === 'line' || type === 'area') &&
        series.map((s, si) => {
          const pts = labels.map((_, i) => ({ x: xFor(i), y: yFor(s.values[i] ?? 0), v: s.values[i] ?? 0 }));
          const linePath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + plotH} L ${pts[0].x} ${padT + plotH} Z`;
          return (
            <g key={si}>
              {type === 'area' && <path d={areaPath} fill={s.color} opacity={0.18} />}
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 7 : 5} fill={s.color} stroke="#0b0c1c" strokeWidth={2} />
                  <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontFamily="Tahoma, Arial">
                    {p.v}
                  </text>
                  {si === 0 && (
                    <text x={p.x} y={H - 28} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontFamily="Tahoma, Arial">
                      {labels[i].length > 14 ? `${labels[i].slice(0, 12)}…` : labels[i]}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
    </svg>
  );
}
