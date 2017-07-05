var imageUrls = require("./imageUrls");
var d3 = require("d3");
var u;
var globals = {};

// global dimensions
function reset() {
  Object.assign(globals, {
    margin: { top: 100, right: 50, bottom: 105, left: 50 },
    padding: { top: 100, right: 50, bottom: 105, left: 50 },
    effective_filter_width: u,
    effective_filter_height: u,
    width: u,
    height: u,

    // initialize global variables
    date_granularity: u,
    segment_granularity: u,
    usage_log: [],
    max_num_tracks: u,
    max_num_seq_tracks: u,
    legend_panel: u,
    legend: u,
    legend_rect_size: u,
    legend_spacing: u,
    legend_expanded: true,
    legend_x: 100,
    legend_y: 100,
    source: u,
    source_format: u,
    earliest_date: u,
    latest_start_date: u,
    latest_end_date: u,
    categories: u, // scale for event types
    selected_categories: [],
    num_categories: u,
    max_legend_item_width: 0,
    facets: u, // scale for facets (timelines)
    num_facets: u,
    selected_facets: [],
    total_num_facets: u,
    num_facet_rows: u,
    num_facet_cols: u,
    segments: u, // scale for segments
    present_segments: u,

    /**
     * The selected date granularities used for filtering
     */
    selected_segments: [],
    num_segments: u,
    num_segment_cols: u,
    num_segment_rows: u,
    buffer: 25,
    time_scale: u, // scale for time (years)
    timeline_facets: u,
    num_tracks: u,
    num_seq_tracks: u,
    global_min_start_date: u,
    global_max_end_date: u,
    max_end_age: u,
    max_seq_index: u,
    dispatch: d3.dispatch("Emphasize", "remove"),
    filter_result: u,
    scales: [
      { "name": "Chronological", "icon": imageUrls("s-chron.png"), "hint": "A <span class='rb_hint_scale_highlight'>CHRONOLOGICAL</span> scale is useful for showing absolute dates and times, like 2017, or 1999-12-31, or 6:37 PM." },
      { "name": "Relative", "icon": imageUrls("s-rel.png"), "hint": "A <span class='rb_hint_scale_highlight'>RELATIVE</span> scale is useful when comparing <span class='rb_hint_layout_highlight'>Faceted</span> timelines with a common baseline at time 'zero'.For example, consider a timeline of person 'A' who lived between 1940 to 2010 and person 'B' who lived between 1720 and 1790. A <span class='rb_hint_scale_highlight'>Relative</span> scale in this case would span from 0 to 70 years." },
      { "name": "Log", "icon": imageUrls("s-log.png"), "hint": "A base-10 <span class='rb_hint_scale_highlight'>LOGARITHMIC</span> scale is useful for long-spanning timelines and a skewed distributions of events.  This scale is compatible with a <span class='rb_hint_rep_highlight'>Linear</span> representation." },
      { "name": "Sequential", "icon": imageUrls("s-seq.png"), "hint": "A <span class='rb_hint_scale_highlight'>SEQUENTIAL</span> scale is useful for showing simply the order and number of events." },
      { "name": "Collapsed", "icon": imageUrls("s-intdur.png"), "hint": "A <span class='rb_hint_scale_highlight'>COLLAPSED</span> scale is a hybrid between <span class='rb_hint_scale_highlight'>Sequential</span> and <span class='rb_hint_scale_highlight'>Chronological</span>, and is useful for showing uneven distributions of events. It is compatible with a <span class='rb_hint_rep_highlight'>Linear</span> representation and <span class='rb_hint_layout_highlight'>Unified</span> layout. The duration between events is encoded as the length of bars." }],
    layouts: [
      { "name": "Unified", "icon": imageUrls("l-uni.png"), "hint": "A <span class='rb_hint_layout_highlight'>UNIFIED</span> layout is a single uninterrupted timeline and is useful when your data contains no facets." },
      { "name": "Faceted", "icon": imageUrls("l-fac.png"), "hint": "A <span class='rb_hint_layout_highlight'>FACETED</span> layout is useful when you have multiple timelines to compare." },
      { "name": "Segmented", "icon": imageUrls("l-seg.png"), "hint": "A <span class='rb_hint_layout_highlight'>SEGMENTED</span> layout splits a timeline into meaningful segments like centuries or days, depending on the extent of your timeline.It is compatible with a <span class='rb_hint_scale_highlight'>Chronological</span> scale and is useful for showing patterns or differences across segments, such as periodicity." }],
    representations: [
      { "name": "Linear", "icon": imageUrls("r-lin.png"), "hint": "A <span class='rb_hint_rep_highlight'>LINEAR</span> representation is read left-to-right and is the most familiar timeline representation." },
      { "name": "Radial", "icon": imageUrls("r-rad.png"), "hint": "A <span class='rb_hint_rep_highlight'>RADIAL</span> representation is useful for showing cyclical patterns. It has the added benefit of a square aspect ratio." },
      { "name": "Spiral", "icon": imageUrls("r-spi.png"), "hint": "A <span class='rb_hint_rep_highlight'>SPIRAL</span> is a compact and playful way to show a sequence of events. It has a square aspect ratio and is only compatible with a <span class='rb_hint_scale_highlight'>Sequential</span> scale." },
      { "name": "Curve", "icon": imageUrls("r-arb.png"), "hint": "A <span class='rb_hint_rep_highlight'>CURVE</span> is a playful way to show a sequence of events. It is only compatible with a <span class='rb_hint_scale_highlight'>Sequential</span> scale and a <span class='rb_hint_layout_highlight'>Unified</span> layout.Drag to draw a curve on the canvas; double click the canvas to reset the curve." },
      { "name": "Calendar", "icon": imageUrls("r-cal.png"), "hint": "A month-week-day <span class='rb_hint_rep_highlight'>CALENDAR</span> is a familiar representation that is compatible with a <span class='rb_hint_scale_highlight'>Chronological</span> scale and a <span class='rb_hint_layout_highlight'>Segmented</span> layout. This representation does not currently support timelines spanning decades or longer." },
      { "name": "Grid", "icon": imageUrls("r-grid.png"), "hint": "A 10x10 <span class='rb_hint_rep_highlight'>GRID</span> representation is compatible with a <span class='rb_hint_scale_highlight'>Chronological</span> scale and a <span class='rb_hint_layout_highlight'>Segmented</span> layout. This representation is ideal for timelines spanning decades or centuries." }],
    unit_width: 15,
    track_height: 15 * 1.5,
    spiral_padding: 15 * 1.25,
    spiral_dim: 0,
    centre_radius: 50,
    max_item_index: 0,
    filter_type: "Emphasize",
    image_index: 0,
    active_data: [],
    all_data: [],
    active_event_list: [],
    prev_active_event_list: [],
    all_event_ids: [],
    scenes: [],
    caption_list: [],
    image_list: [],
    annotation_list: [],
    current_scene_index: -1,
    gif_index: 0,
    filter_set_length: 0,
    leader_line_styles: ["Rectangular", "Octoline", "Curved"],
    leader_line_style: 1, // 0=OCTO, 1=RECT, 2=CURVE
    curve: false,
    dirty_curve: false,
    record_width: u,
    record_height: u,
    reader: new FileReader(),
    timeline_json_data: [],
    gdoc_key: "1x8N7Z9RUrA9Jmc38Rvw1VkHslp8rgV2Ws3h_5iM-I8M",
    gdoc_worksheet: "dailyroutines",
    timeline_story: {},
    opt_out: false,
    email_address: "",
    formatNumber: d3.format(".0f"),
    range_text: "",
    color_palette: [],
    color_swap_target: 0,
    use_custom_palette: false,
    serverless: false,
    socket: u
  }); // Defined in main.js
}

globals.reset = reset;

reset(); // Set the initial values

globals.formatAbbreviation = function (x) {
  "use strict";

  var v = Math.abs(x);
  if (v >= 0.9995e9) {
    return globals.formatNumber(x / 1e9) + "B";
  } else if (v >= 0.9995e6) {
    return globals.formatNumber(x / 1e6) + "M";
  } else if (v >= 0.9995e3) {
    return globals.formatNumber(x / 1e3) + "k";
  }
  return globals.formatNumber(x);
};

// function for checking if string is a number
globals.isNumber = function (n) {
  "use strict";
  return !isNaN(parseFloat(n)) && isFinite(n);
};

module.exports = globals;
