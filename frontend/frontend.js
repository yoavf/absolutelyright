// Chart annotations configuration
const CHART_ANNOTATIONS = [
	{ date: '2025-09-29', label: 'Sonnet 4.5' },
	{ date: '2025-11-24', label: 'Opus 4.5' },
	{ date: '2025-12-28', label: 'Stopped counting', isFinal: true }
];

// Parse date string as local date (avoiding timezone issues)
function parseLocalDate(dateStr) {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year, month - 1, day);
}

// Format date as YYYY-MM-DD
function formatDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

// Helper to get ISO week number and year from a date
function getWeekKey(dateStr) {
	const date = parseLocalDate(dateStr);
	const thursday = new Date(date);
	thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
	const firstThursday = new Date(thursday.getFullYear(), 0, 4);
	const weekNum = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
	return `${thursday.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

// Get the Monday of a week from a date
function getWeekStart(dateStr) {
	const date = parseLocalDate(dateStr);
	const day = date.getDay();
	const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
	const monday = new Date(date.getFullYear(), date.getMonth(), diff);
	return formatDate(monday);
}

// Aggregate daily data into weekly data
function aggregateByWeek(history) {
	const weekMap = new Map();

	history.forEach(d => {
		const weekKey = getWeekKey(d.day);
		const weekStart = getWeekStart(d.day);

		if (!weekMap.has(weekKey)) {
			weekMap.set(weekKey, {
				weekKey,
				weekStart,
				count: 0,
				right_count: 0,
				total_messages: 0,
				days: []
			});
		}

		const week = weekMap.get(weekKey);
		week.count += d.count || 0;
		week.right_count += d.right_count || 0;
		week.total_messages += d.total_messages || 0;
		week.days.push(d.day);
	});

	return Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// Aggregate daily data into bi-weekly (2 week) data
function aggregateByBiWeek(history) {
	const biWeekMap = new Map();

	history.forEach(d => {
		const weekKey = getWeekKey(d.day);
		const weekStart = getWeekStart(d.day);

		// Get week number and pair into bi-weeks
		const weekNum = parseInt(weekKey.split('-W')[1]);
		const biWeekNum = Math.floor((weekNum - 1) / 2);
		const year = weekKey.split('-W')[0];
		const biWeekKey = `${year}-BW${biWeekNum}`;

		if (!biWeekMap.has(biWeekKey)) {
			biWeekMap.set(biWeekKey, {
				biWeekKey,
				weekStart, // Use first week's start as the period start
				count: 0,
				right_count: 0,
				total_messages: 0,
				days: []
			});
		}

		const biWeek = biWeekMap.get(biWeekKey);
		// Keep the earliest weekStart
		if (weekStart < biWeek.weekStart) {
			biWeek.weekStart = weekStart;
		}
		biWeek.count += d.count || 0;
		biWeek.right_count += d.right_count || 0;
		biWeek.total_messages += d.total_messages || 0;
		biWeek.days.push(d.day);
	});

	return Array.from(biWeekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

async function fetchThisWeek(animate = false) {
	try {
		// Fetch history to calculate this week's total
		const res = await fetch("/api/history");
		const history = await res.json();

		const countElement = document.getElementById("today-inline");
		const subtitleElement = document.querySelector(".subtitle");
		const rightCountElement = document.getElementById("right-count");
		const titleActive = document.getElementById("title-active");
		const titleZero = document.getElementById("title-zero");

		// Get current week key
		const today = new Date().toISOString().split("T")[0];
		const currentWeekKey = getWeekKey(today);

		// Sum up this week's counts
		let weekCount = 0;
		let weekRightCount = 0;

		history.forEach(d => {
			if (getWeekKey(d.day) === currentWeekKey) {
				weekCount += d.count || 0;
				weekRightCount += d.right_count || 0;
			}
		});

		// Toggle title based on count
		if (weekCount === 0) {
			titleActive.style.display = "none";
			titleZero.style.display = "block";
		} else {
			titleActive.style.display = "block";
			titleZero.style.display = "none";
		}

		// Update right count display
		if (weekRightCount > 0) {
			rightCountElement.textContent = `(I was just "right" ${weekRightCount} ${weekRightCount === 1 ? 'time' : 'times'})`;
			rightCountElement.style.display = "block";
		} else {
			rightCountElement.style.display = "none";
		}

		const timesLabel = document.getElementById("times-label");
		const updateTimesLabel = (count) => {
			timesLabel.textContent = count === 1 ? 'time' : 'times';
		};

		if (animate && weekCount > 0) {
			// Show count - 1 first
			countElement.textContent = weekCount - 1;
			updateTimesLabel(weekCount - 1);

			// Fade in the subtitle
			subtitleElement.style.transition = "opacity 0.5s ease-in";
			subtitleElement.style.opacity = "1";

			// After a second, animate to the real count
			setTimeout(() => {
				countElement.style.transform = "scale(1.3)";
				countElement.style.color = "#e63946";
				countElement.textContent = weekCount;
				updateTimesLabel(weekCount);

				// Reset the scale
				setTimeout(() => {
					countElement.style.transform = "";
				}, 300);
			}, 1000);
		} else {
			countElement.textContent = weekCount;
			updateTimesLabel(weekCount);
			// Fade in for non-animated load
			subtitleElement.style.transition = "opacity 0.5s ease-in";
			subtitleElement.style.opacity = "1";
		}
	} catch (error) {
		console.error("Error fetching this week:", error);
	}
}

async function fetchHistory() {
	try {
		const res = await fetch("/api/history");
		let history = await res.json();

		// Filter to only show data from Sep 1, 2025 to Dec 28, 2025
		const chartStartDate = '2025-09-01';
		const chartEndDate = '2025-12-28';
		console.log('Raw API data (last 10):', history.slice(-10).map(d => d.day));
		history = history.filter(d => d.day >= chartStartDate && d.day <= chartEndDate);
		console.log('After filter (last 10):', history.slice(-10).map(d => d.day));

		// Add today if it's not in the history (and within date range)
		const today = new Date().toISOString().split("T")[0];
		const hasToday = history.some((d) => d.day === today);

		if (!hasToday && today >= chartStartDate && today <= chartEndDate) {
			// Fetch today's count to add to the chart
			const todayRes = await fetch("/api/today");
			const todayData = await todayRes.json();
			history.push({
				day: today,
				count: todayData.count || 0,
				right_count: todayData.right_count || 0,
				total_messages: todayData.total_messages || 0,
			});

			// Sort by date to ensure chronological order
			history.sort((a, b) => a.day.localeCompare(b.day));
		}

		currentHistory = history; // Store for resize
		drawChart(history);
	} catch (error) {
		console.error("Error fetching history:", error);
	}
}

function drawChart(history) {
	const chartElement = document.getElementById("chart");

	// Store original daily history for annotations
	const dailyHistory = history;

	// Check if mobile
	const isMobile = window.innerWidth <= 600;

	// Aggregate by bi-week on mobile, by week on desktop
	if (isMobile) {
		history = aggregateByBiWeek(history);
	} else {
		history = aggregateByWeek(history);
	}
	chartElement.innerHTML = "";

	if (history.length === 0) return;

	// Make chart dimensions responsive
	const containerWidth = Math.min(window.innerWidth - 40, 760);
	const width = containerWidth;
	const height = isMobile ? 300 : 350;
	const margin = isMobile
		? { top: 20, right: 10, bottom: 60, left: 40 }
		: { top: 30, right: 20, bottom: 70, left: 80 };

	// Create container div for roughViz
	const container = document.createElement('div');
	container.id = 'chart-container';
	chartElement.appendChild(container);
	
	// Show all data (monthly on mobile, weekly on desktop)
	const displayHistory = history;

	console.log('Chart data:', displayHistory.map(d => ({
		period: d.weekStart,
		count: d.count,
		right: d.right_count,
		total: d.total_messages
	})));

	// Prepare data in the format roughViz expects for stacked bars
	const data = displayHistory.map((d, i) => {
		const date = new Date(d.weekStart);
		const label = isMobile
			? date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
			: date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

		return {
			date: label,
			'Absolutely right': d.count,
			'Just right': d.right_count || 0
		};
	});

	if (typeof roughViz === 'undefined') {
		console.error('roughViz library not loaded!');
		return;
	}
	
	new roughViz.StackedBar({
		element: '#chart-container',
		data: data,
		labels: 'date',
		width: width,
		height: height,
		highlight: ['coral', 'skyblue'],
		roughness: 1.5,
		font: 'Gaegu',
		xLabel: '',
		yLabel: isMobile ? '' : 'Times Right',
		interactive: true,
		tooltipFontSize: '0.95rem',
		margin: margin,
		axisFontSize: isMobile ? '10' : '12',
		axisStrokeWidth: isMobile ? 1 : 1.5,
		strokeWidth: isMobile ? 1.5 : 2,
	});

	setTimeout(() => {
		// Add chart annotations (pass dailyHistory for date lookup)
		addChartAnnotations(chartElement, displayHistory, dailyHistory, isMobile, width, height, margin);

		// Add total messages bars behind the main bars
		addTotalMessagesBars(chartElement, displayHistory, isMobile, width, height, margin);
	}, 100);
}

function addTotalMessagesBars(chartElement, displayHistory, isMobile, width, height, margin) {
	// Skip on mobile
	if (isMobile) return;

	const svg = chartElement.querySelector('svg');
	if (!svg) return;

	// Get actual SVG dimensions from viewBox
	const viewBox = svg.getAttribute('viewBox');
	const [, , vbWidth, vbHeight] = viewBox ? viewBox.trim().split(/\s+/).map(Number) : [0, 0, width, height];

	const chartWidth = vbWidth - margin.left - margin.right;
	const chartHeight = vbHeight - margin.top - margin.bottom;

	// Find all rect elements (bars) to determine x positions and bar widths
	const rects = Array.from(svg.querySelectorAll('rect'));
	const barGroups = new Map();
	rects.forEach(rect => {
		const x = parseFloat(rect.getAttribute('x'));
		if (!barGroups.has(x)) {
			barGroups.set(x, []);
		}
		barGroups.get(x).push(rect);
	});

	const sortedXPositions = Array.from(barGroups.keys()).sort((a, b) => a - b);

	// Find the main chart group
	const groups = svg.querySelectorAll('g');
	const chartGroup = Array.from(groups).find(g => {
		const t = g.getAttribute('transform');
		return t && t.includes(`translate(${margin.left}`) && t.includes(`${margin.top})`);
	});

	if (!chartGroup) return;

	// Filter to only show total messages from Sep 13, 2025 onwards
	const startDate = '2025-09-13';
	const filteredHistory = displayHistory.filter(d => d.weekStart >= startDate);

	if (filteredHistory.length === 0) return;

	// Calculate min and max total messages for square root scaling
	// Square root scale spreads out lower values while maintaining better differentiation at the top
	const totalMessagesValues = filteredHistory.map(d => d.total_messages || 0).filter(v => v > 0);
	const minTotalMessages = Math.min(...totalMessagesValues, 1);
	const maxTotalMessages = Math.max(...totalMessagesValues, 1);
	const sqrtMin = Math.sqrt(minTotalMessages);
	const sqrtMax = Math.sqrt(maxTotalMessages);
	const sqrtRange = sqrtMax - sqrtMin || 1;

	// Ensure chart element is positioned relatively for absolute tooltips
	if (!chartElement.style.position || chartElement.style.position === 'static') {
		chartElement.style.position = 'relative';
	}

	// Create or reuse tooltip element (with semi-transparent background)
	let tooltip = chartElement.querySelector('.totals-tooltip');
	if (!tooltip) {
		tooltip = document.createElement('div');
		tooltip.className = 'totals-tooltip';
		tooltip.style.cssText = 'position: absolute; padding: 0.5rem; font-size: 0.95rem; line-height: 1rem; opacity: 0; pointer-events: none; font-family: Gaegu, cursive; z-index: 10000; color: #374151; background: rgba(255, 255, 255, 0.9); border-radius: 4px;';
		chartElement.appendChild(tooltip);
	}

	// Calculate line points for total messages (only for filtered dates)
	const linePoints = filteredHistory.map((d) => {
		// Find the index in the original displayHistory to get the correct x position
		const originalIndex = displayHistory.findIndex(h =>
			(h.weekKey && h.weekKey === d.weekKey) || (h.biWeekKey && h.biWeekKey === d.biWeekKey)
		);
		const totalMsgs = d.total_messages || 0;

		// Get x position (center of bar) using originalIndex
		let xPosition;
		if (sortedXPositions[originalIndex] !== undefined) {
			const targetX = sortedXPositions[originalIndex];
			const targetRects = barGroups.get(targetX);
			const barWidth = targetRects[0] ? parseFloat(targetRects[0].getAttribute('width')) : chartWidth / displayHistory.length * 0.6;
			xPosition = targetX + barWidth / 2;
		} else {
			// Fallback calculation
			const barWidth = chartWidth / displayHistory.length;
			xPosition = (originalIndex * barWidth) + (barWidth / 2);
		}

		// Square root scale: map sqrt(min)-sqrt(max) range to 10%-100% of chart height
		// This spreads out lower values while maintaining better differentiation at the top
		// Min value will be at 10% from bottom, max at 100% from bottom (top of chart)
		const sqrtValue = Math.sqrt(totalMsgs);
		const normalizedValue = (sqrtValue - sqrtMin) / sqrtRange;
		const yPosition = chartHeight - (0.1 + normalizedValue * 0.9) * chartHeight;

		return { x: xPosition, y: yPosition, value: totalMsgs, originalIndex };
	});

	// Draw hand-drawn style line using rough.js
	if (typeof rough !== 'undefined' && linePoints.length > 1) {
		// Filter out any invalid points (NaN or undefined values)
		const validPoints = linePoints.filter(p =>
			!isNaN(p.x) && !isNaN(p.y) && isFinite(p.x) && isFinite(p.y)
		);

		if (validPoints.length > 1) {
			const rc = rough.svg(svg);

			// Create path data for the line - use separate points
			const points = validPoints.map(p => [p.x, p.y]);

			// Draw rough linearPath instead of path
			const roughPath = rc.linearPath(points, {
				stroke: '#c0c4ca',
				strokeWidth: isMobile ? 2.5 : 3,
				roughness: 1.5,
				bowing: 1
			});

			// Set opacity and class for toggling
			roughPath.setAttribute('opacity', '0.6');
			roughPath.classList.add('total-line');
			roughPath.style.display = totalLineVisible ? 'block' : 'none';

			// Insert line at the beginning so it's behind the main bars
			chartGroup.insertBefore(roughPath, chartGroup.firstChild);
		}
	} else {
		console.log('rough.js not loaded yet or insufficient points');
	}

	// Draw circles at each point with tooltips
	linePoints.forEach((p, i) => {
		if (p.value > 0) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', p.x);
			circle.setAttribute('cy', p.y);
			circle.setAttribute('r', isMobile ? '3' : '3.5');
			circle.setAttribute('fill', '#c0c4ca');
			circle.setAttribute('stroke', 'white');
			circle.setAttribute('stroke-width', '1.5');
			circle.setAttribute('opacity', '0.9');
			circle.style.cursor = 'pointer';
			circle.classList.add('total-line');
			circle.style.display = totalLineVisible ? 'block' : 'none';

			// Add roughViz-style tooltip
			circle.addEventListener('mouseenter', (e) => {
				// Clear and rebuild tooltip content safely
				tooltip.textContent = '';

				// Add period date
				const item = displayHistory[p.originalIndex];
				const date = new Date(item.weekStart);
				const dateStr = item.biWeekKey
					? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
					: 'Week of ' + date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
				tooltip.appendChild(document.createTextNode(dateStr + ': '));

				// Add bold count
				const bold = document.createElement('b');
				bold.textContent = p.value.toString();
				tooltip.appendChild(bold);
				tooltip.appendChild(document.createTextNode(' total'));

				tooltip.style.display = 'block';
				tooltip.style.opacity = '1';

				const chartRect = chartElement.getBoundingClientRect();
				tooltip.style.left = (e.clientX - chartRect.left + 10) + 'px';
				tooltip.style.top = (e.clientY - chartRect.top - 30) + 'px';
			});

			circle.addEventListener('mousemove', (e) => {
				const chartRect = chartElement.getBoundingClientRect();
				tooltip.style.left = (e.clientX - chartRect.left + 10) + 'px';
				tooltip.style.top = (e.clientY - chartRect.top - 30) + 'px';
			});

			circle.addEventListener('mouseleave', () => {
				tooltip.style.opacity = '0';
				tooltip.style.display = 'none';
			});

			chartGroup.appendChild(circle);
		}
	});
}

function addChartAnnotations(chartElement, displayHistory, dailyHistory, isMobile, width, height, margin) {
	const svg = chartElement.querySelector('svg');
	if (!svg) return;

	// Get actual SVG dimensions from viewBox
	const viewBox = svg.getAttribute('viewBox');
	const [, , vbWidth, vbHeight] = viewBox ? viewBox.trim().split(/\s+/).map(Number) : [0, 0, width, height];

	const groups = svg.querySelectorAll('g');

	// Find all rect elements (bars) and group by x position
	const rects = Array.from(svg.querySelectorAll('rect'));

	// Group rects by x coordinate (each bar may have multiple stacked rects)
	const barGroups = new Map();
	rects.forEach(rect => {
		const x = parseFloat(rect.getAttribute('x'));
		if (!barGroups.has(x)) {
			barGroups.set(x, []);
		}
		barGroups.get(x).push(rect);
	});

	// Sort by x position to match display order
	const sortedXPositions = Array.from(barGroups.keys()).sort((a, b) => a - b);

	// Find the main chart group (has translate with margin values)
	const chartGroup = Array.from(groups).find(g => {
		const t = g.getAttribute('transform');
		return t && t.includes(`translate(${margin.left}`) && t.includes(`${margin.top})`);
	});

	// Add each annotation
	CHART_ANNOTATIONS.forEach(annotation => {
		// Find which period contains this annotation date
		let periodIndex;
		if (isMobile) {
			// Find bi-week on mobile
			const weekKey = getWeekKey(annotation.date);
			const weekNum = parseInt(weekKey.split('-W')[1]);
			const biWeekNum = Math.floor((weekNum - 1) / 2);
			const year = weekKey.split('-W')[0];
			const biWeekKey = `${year}-BW${biWeekNum}`;
			periodIndex = displayHistory.findIndex(d => d.biWeekKey === biWeekKey);
		} else {
			// Find week on desktop
			const annotationWeekKey = getWeekKey(annotation.date);
			periodIndex = displayHistory.findIndex(d => d.weekKey === annotationWeekKey);
		}
		if (periodIndex === -1) return;

		const weekIndex = periodIndex; // Keep variable name for compatibility

		let xPosition;
		if (sortedXPositions[weekIndex] !== undefined) {
			const targetX = sortedXPositions[weekIndex];
			const targetRects = barGroups.get(targetX);
			const rectWidth = targetRects[0] ? parseFloat(targetRects[0].getAttribute('width')) : 0;
			xPosition = targetX + (rectWidth / 2);
		} else {
			// Fallback to calculation
			const chartWidth = width - margin.left - margin.right;
			const barWidth = chartWidth / displayHistory.length;
			xPosition = margin.left + (weekIndex * barWidth) + (barWidth / 2);
		}

		// Different styling for final marker
		const isFinal = annotation.isFinal;
		const lineColor = isFinal ? '#d97706' : '#e63946'; // Amber for final, red for others

		if (isFinal && typeof rough !== 'undefined') {
			// "THE END" text below the x-axis with arrow pointing up to chart
			const chartHeight = vbHeight - margin.bottom - margin.top;
			const rc = rough.svg(svg);

			// Text position
			const textY = chartHeight + 55;

			// Arrow from text up to just below the chart
			const arrowStartX = xPosition;
			const arrowStartY = textY - 18;
			const arrowEndX = xPosition;
			const arrowEndY = chartHeight + 5;

			// Draw the arrow shaft
			const shaft = rc.line(arrowStartX, arrowStartY, arrowEndX, arrowEndY, {
				stroke: lineColor,
				strokeWidth: 2,
				roughness: 1.5,
				bowing: 1
			});

			// Draw arrow head pointing up
			const headSize = 10;
			const leftHead = rc.line(arrowEndX, arrowEndY, arrowEndX - headSize, arrowEndY + headSize, {
				stroke: lineColor,
				strokeWidth: 2,
				roughness: 1.5,
				bowing: 1
			});
			const rightHead = rc.line(arrowEndX, arrowEndY, arrowEndX + headSize, arrowEndY + headSize, {
				stroke: lineColor,
				strokeWidth: 2,
				roughness: 1.5,
				bowing: 1
			});

			// Text label
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', xPosition);
			text.setAttribute('y', textY);
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('fill', lineColor);
			text.setAttribute('font-family', 'Gaegu, cursive');
			text.setAttribute('font-size', isMobile ? '14' : '16');
			text.setAttribute('font-weight', 'bold');
			text.setAttribute('font-style', 'italic');
			text.textContent = 'THE END';

			if (chartGroup) {
				chartGroup.appendChild(shaft);
				chartGroup.appendChild(leftHead);
				chartGroup.appendChild(rightHead);
				chartGroup.appendChild(text);
			}
		} else {
			// Regular dashed line for other annotations
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', xPosition);
			line.setAttribute('y1', 0);
			line.setAttribute('x2', xPosition);
			line.setAttribute('y2', vbHeight - margin.bottom - margin.top);
			line.setAttribute('stroke', lineColor);
			line.setAttribute('stroke-width', '2');
			line.setAttribute('stroke-dasharray', '5,5');
			line.setAttribute('opacity', '0.7');

			// Create text label
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', xPosition);
			text.setAttribute('y', -5);
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('fill', lineColor);
			text.setAttribute('font-family', 'Gaegu, cursive');
			text.setAttribute('font-size', isMobile ? '11' : '13');
			text.setAttribute('font-weight', 'bold');
			text.textContent = annotation.label;

			// Append to chart group
			if (chartGroup) {
				chartGroup.appendChild(line);
				chartGroup.appendChild(text);
			} else {
				svg.appendChild(line);
				svg.appendChild(text);
			}
		}
	});
}

// Store history globally for redraw
let currentHistory = [];

// Track visibility of total line
let totalLineVisible = true;

// Load rough.js library first, then roughViz
const roughScript = document.createElement('script');
roughScript.src = 'https://unpkg.com/roughjs@4.5.2/bundled/rough.js';
roughScript.onload = () => {
	// Then load roughViz library
	const script = document.createElement('script');
	script.src = 'https://unpkg.com/rough-viz@2.0.5';
	script.onload = () => {
		// Initial load with animation
		fetchThisWeek(true);
		fetchHistory().then(() => {
			// Initialize total line legend toggle
			const legendItems = document.querySelectorAll('.legend-item');
			const totalLegendItem = legendItems[2]; // Third item is total assistant messages

			if (totalLegendItem) {
				totalLegendItem.style.cursor = 'pointer';
				totalLegendItem.addEventListener('click', () => {
					// Toggle visibility
					totalLineVisible = !totalLineVisible;

					// Update legend visual state with CSS class
					if (totalLineVisible) {
						totalLegendItem.classList.remove('disabled');
					} else {
						totalLegendItem.classList.add('disabled');
					}

					// Toggle all total line elements
					const totalElements = document.querySelectorAll('.total-line');
					totalElements.forEach(el => {
						el.style.display = totalLineVisible ? 'block' : 'none';
					});
				});
			}

			// Redraw chart on window resize
			let resizeTimeout;
			window.addEventListener("resize", () => {
				clearTimeout(resizeTimeout);
				resizeTimeout = setTimeout(() => {
					if (currentHistory.length > 0) {
						drawChart(currentHistory);
					}
				}, 250);
			});
		});
	};
	document.head.appendChild(script);
};
document.head.appendChild(roughScript);

// Refresh every 5 seconds (without animation)
setInterval(() => fetchThisWeek(false), 5000);