/**
--------------------------------------------------------------------------------------
TIMELINE STORYTELLER

Matthew Brehmer
© 2017 Microsoft
--------------------------------------------------------------------------------------
**/

/**
--------------------------------------------------------------------------------------
GLOBAL VARIABLES
--------------------------------------------------------------------------------------
**/

//global dimensions
var margin = {top: 100, right: 70, bottom: 105, left: 70},
    padding = {top: 100, right: 70, bottom: 105, left: 70},
    width,
    height;

//initialize global variables accessed by multiple visualziations
var date_granularity,
    segment_granularity,
    max_num_tracks,
    max_num_seq_tracks,
    legend_panel,
    legend,
    legend_rect_size,
    legend_spacing,
    legend_expanded = true,
    legend_x = 0,
    legend_y = 0,
    source,
    source_format,
    earliest_date,
    latest_start_date,
    latest_end_date,
    categories, //scale for event types
    selected_categories = [],
    num_categories,
    max_legend_item_width = 0,
    facets, //scale for facets (timelines)
    selected_facets = [],
    num_facets,
    total_num_facets,
    num_facet_cols,
    num_facet_rows,
    segments, //scale for segments
    timeline_segments = [],
    present_segments,
    selected_segments = [],
    num_segments,
    num_segment_cols,
    num_segment_rows,
    buffer = 25,
    time_scale, // scale for time (years)
    timeline_facets,
    num_tracks,
    num_seq_tracks,
    global_min_start_date,
    global_max_end_date,
    max_end_age,
    max_seq_index,
    dispatch = d3.dispatch("highlight", "remove"),
    filter_result,
    timeline_vis = d3.configurableTL(),
    scales = [
      {"name":"Chronological","icon":"img/s-chron.png","hint":"A chronological scale is useful for showing absolute dates and times, like 2017, or 1999-12-31, or 6:37 PM."},
      {"name":"Relative","icon":"img/s-rel.png","hint":"A relative scale is useful when comparing Faceted timelines with a common baseline at time zero."},
      {"name":"Log","icon":"img/s-log.png","hint":"A logarithmic scale is useful for timelines with a long period of time between the first and last events and a skewed distributions of events."},
      {"name":"Sequential","icon":"img/s-seq.png","hint":"A sequential scale is useful for showing simply the order and number of events."},
      {"name":"Collapsed","icon":"img/s-intdur.png","hint":"A collapsed scale is a hybrid between the Sequential and Chronological, useful when there are large gaps in the chronology of the timeline; the duration between events is encoded as the length of bars."}],
    layouts = [
      {"name":"Unified","icon":"img/l-uni.png","hint":"A unified layout is a single uninterrupted timeline and is useful when your data contains no facets."},
      {"name":"Faceted","icon":"img/l-fac.png","hint":"A faceted layout is useful when your have multiple timelines to compare."},
      {"name":"Segmented","icon":"img/l-seg.png","hint":"A segmented layout splits a timeline into meaningful segments like centuries or days, depending on the extent of your timeline, and is useful for showing patterns or differences across segments, such as periodicity."}],
    representations = [
      {"name":"Linear","icon":"img/r-lin.png","hint":"A linear representation is read left-to-right and is the most familiar timeline representation."},
      {"name":"Radial","icon":"img/r-rad.png","hint":"A radial representation is useful for showing cyclical patterns and ensures a square aspect ratio."},
      {"name":"Spiral","icon":"img/r-spi.png","hint":"A spiral is a compact and playful way to show a sequence of events."},
      {"name":"Curve","icon":"img/r-arb.png","hint":"A curve is a playful way to show a sequence of events. Drag to draw a curve on the canvas. Double click the canvas to reset the curve."},
      {"name":"Calendar","icon":"img/r-cal.png","hint":"A calendar is a familiar representation compatible with a segmented layout, which segments by month and day. Don't use this representation if your timeline spans many years, or less than a day."},
      {"name":"Grid","icon":"img/r-grid.png","hint":"A grid is useful in conjunction with a segmented layout for showing patterns of events across decades and centuries. Don't use this representation if you timeline spans many millenia or longer, or if your timeline spans less than a few years."}],
    unit_width = 15,
    track_height = unit_width * 1.5,
    // unit_width = 7.5, // Priestley style
    // track_height = unit_width * 4, // Priestley style
    spiral_padding = unit_width * 1.25,
    spiral_dim = 0,
    centre_radius = 50,
    max_item_index = 0,
    filter_type = "Highlight",
    caption_index = 0,
    image_index = 0,
    active_data = [],
    all_data = [],
    active_event_list = [],
    prev_active_event_list = [],
    all_event_ids = [],
    scenes = [],
    caption_list = [],
    image_list = [],
    annotation_list = [],
    current_scene_index = -1,
    gif_index = 0,
    playback_mode = false,
    filter_set_length = 0,
    leader_line_styles = ['Rectangular', 'Octoline', 'Curved'],
    leader_line_style = 1, // 0=OCTO, 1=RECT, 2=CURVE
    curve = false,
    dirty_curve = false,
    record_width = width,
    record_height = height,
    filter_transition = false,
    reader = new FileReader(),
    gif = new GIF({
      workers: 2,
      quality: 10,
      background: '#fff',
      workerScript: "js/lib/gif.worker.js"
    }),
    timeline_json_data = [],
    gdoc_key = '1x8N7Z9RUrA9Jmc38Rvw1VkHslp8rgV2Ws3h_5iM-I8M',
    gdoc_worksheet = 'dailyroutines',
    timeline_story = {},
    opt_out = false,
    email_address = "",
    usage_log = [],
    formatNumber = d3.format(".0f"),
    range_text = "",
    socket = io({transports:['websocket']});
    // socket = io.connect('https//:timelinestoryteller.azurewebsites.net');


function formatAbbreviation(x) {

  "use strict";

  var v = Math.abs(x);
  if (v >= .9995e9) {
    return formatNumber(x / 1e9) + "B";
  }
  else if (v >= .9995e6) {
    return formatNumber(x / 1e6) + "M";
  }
  else if (v>= .9995e3) {
    return formatNumber(x / 1e3) + "k";
  }
  else {
    return formatNumber(x);
  }
}

(function () {

  "use strict";

  socket.on('hello_from_server', function(data) {
    console.log(data);
  });

  window.onload = function () {
    console.log("Initializing Timeline Storyteller");

    socket.emit('hello_from_client', { hello: 'server' })

    width = window.innerWidth - margin.right - margin.left - getScrollbarWidth(),
    height = window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "initialize",
      event_detail: "Initializing Timeline Storyteller"
    }
    usage_log.push(log_event);
  }

  window.onscroll = function (e) {

    d3.select(".timeline_axis")
    .select(".domain")
    .attr("transform", function () {
      return "translate(0," + window.scrollY + ")";
    });

    d3.select(".timeline_axis")
    .selectAll(".tick text")
    .attr("y", window.scrollY - 6);

    // d3.select(".legend")
    // .attr("x", +legend_x + window.scrollX)
    // .attr("y", +legend_y + window.scrollY);
  };

  var legendDrag = d3.behavior.drag()
  .origin(function () {
    var t = d3.select(this);

    return {
      x: t.attr("x"),
      y: t.attr("y")
    };
  })
  .on("drag", function () {

    var x_pos = d3.event.x;
    var y_pos = d3.event.y;

    if (x_pos < 0) {
      x_pos = 0;
    }
    else if (x_pos > (width - margin.right)) {
      x_pos = width - margin.right;
    }

    if (y_pos < 0) {
      y_pos = 0;
    }

    d3.select(this)
    .attr("x", x_pos)
    .attr("y", y_pos);
  })
  .on("dragend", function () {
    legend_x = d3.select(this).attr("x");
    legend_y = d3.select(this).attr("y");

    console.log("legend moved to: " + legend_x + ", " + legend_y);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "legend",
      event_detail: "legend moved to: " + legend_x + ", " + legend_y
    }
    usage_log.push(log_event);
  });

  // http://stackoverflow.com/questions/986937/how-can-i-get-the-browsers-scrollbar-sizes
  function getScrollbarWidth() {
    var outer = document.createElement("div");
    outer.style.visibility = "hidden";
    outer.style.width = "100px";
    document.body.appendChild(outer);

    var widthNoScroll = outer.offsetWidth;
    // force scrollbars
    outer.style.overflow = "scroll";

    // add innerdiv
    var inner = document.createElement("div");
    inner.style.width = "100%";
    outer.appendChild(inner);

    var widthWithScroll = inner.offsetWidth;

    // remove divs
    outer.parentNode.removeChild(outer);

    return widthNoScroll - widthWithScroll;
  }

  /**
  --------------------------------------------------------------------------------------
  KEY PRESS EVENTS
  --------------------------------------------------------------------------------------
  **/

  d3.select("body").on("keydown", function () {
    if (d3.event.keyCode == 76 && d3.event.altKey) {
      //recover legend
      d3.select(".legend")
      .transition()
      .duration(1200)
      .attr("x", 0)
      .attr("y", 0);

      legend_x = 0;
      legend_y = 0;
    }
    if (d3.event.keyCode == 82 && d3.event.altKey) {
      //recover legend
      recordScene();
    }
    else if (playback_mode && d3.event.keyCode == 39) {
      goNextScene()
    }
    else if (playback_mode && d3.event.keyCode == 37) {
      goPreviousScene()
    }
    else if (d3.event.keyCode == 80 && d3.event.altKey) {
      //toggle playback mode
      if (!playback_mode) {
        playback_mode = true;
        d3.select('#navigation_div').attr('class','control_div onhover')
        d3.select("#caption_div").style("display","none");
        d3.select("#image_div").style("display","none");
        d3.select("#menu_div").style("left",-41 + "px");
        d3.select('#menu_div').attr('class','control_div onhover');
        d3.select("#import_div").style("top",-210 + "px");
        d3.select('#import_div').attr('class','control_div onhover');
        d3.select("#option_div").style("top",-95 + "px");
        d3.select('#option_div').attr('class','control_div onhover')
        d3.select("#filter_div").style("display","none");
        d3.select("#footer").style("bottom",-25 + "px");
        d3.select("#logo_div").style("top",-44 + "px");
      }
      else {
        playback_mode = false;
        d3.select('#navigation_div').attr('class','control_div');
        d3.select("#option_div").style("top", 10 + "px");
        d3.select('#option_div').attr('class','control_div');
        d3.select('#import_div').attr('class','control_div');
        d3.select("#menu_div").style("left",10 + "px");
        d3.select('#menu_div').attr('class','control_div')
        d3.select("#footer").style("bottom",0 + "px");
        d3.select("#logo_div").style("top",10 + "px");
      }
    }
    else if (d3.event.keyCode == 46 && d3.select('#caption_div').style('display') == 'none' && d3.select('#image_div').style('display') == 'none' && d3.select("#import_div").style("top") == -210 + "px"){
      //delete current scene unless image or caption div is open
      console.log("scene " + current_scene_index + " deleted.");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "deletion",
        event_detail: "scene " + current_scene_index + " deleted."
      }
      usage_log.push(log_event);

      var scene_deleted = false,
      i = 0;
      while (!scene_deleted) {
        if (scenes[i].s_order == current_scene_index) {
          scenes.splice(i,1);
          d3.select('#frame' + i).remove();
          scene_deleted = true;
        }
        i++;
      }
      scenes.forEach(function (d,i){
        if (scenes[i].s_order > current_scene_index) {
          scenes[i].s_order--;
        }
      })
      current_scene_index--;
      if (current_scene_index < 0) {
        if (scenes.length > 0){
          current_scene_index = scenes.length - 1;
          changeScene(current_scene_index);
        }
        else {
          current_scene_index = -1;
        }
      }
      else {
        changeScene(current_scene_index);
      }
      updateNavigationStepper();
    }
  });

  function goNextScene(){
    //next scene
    if (scenes.length < 2) {
      return;
    }
    else if (current_scene_index < scenes.length - 1) {
      current_scene_index++;
    }
    else {
      current_scene_index = 0;
    }
    console.log("scene: " + (current_scene_index + 1) + " of " + scenes.length);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "playback",
      event_detail: "scene: " + (current_scene_index + 1) + " of " + scenes.length
    }
    usage_log.push(log_event);

    changeScene(current_scene_index);
  }

  function goPreviousScene(){
    //previous scene
    if (scenes.length < 2) {
      return;
    }
    if (current_scene_index > 0) {
      current_scene_index--;
    }
    else {
      current_scene_index = scenes.length - 1;
    }
    console.log("scene: " + current_scene_index + " of " + scenes.length);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "playback",
      event_detail: "scene: " + current_scene_index + " of " + scenes.length
    }
    usage_log.push(log_event);

    changeScene(current_scene_index);
  }

  //initialize main visualization containers
  var main_svg,
  import_div,
  export_div,
  option_div,
  menu_div,
  caption_div,
  image_div,
  filter_div,
  navigation_div;

  gif.on('finished', function(blob) {
    var saveLink = document.createElement('a');
    var downloadSupported = 'download' in saveLink;
    if (downloadSupported) {
      saveLink.download = 'timeline_story.gif';
      saveLink.href = URL.createObjectURL(blob);
      saveLink.style.display = 'none';
      document.body.appendChild(saveLink);
      saveLink.click();
      document.body.removeChild(saveLink);
    }
    else {
      window.open(URL.createObjectURL(blob), '_temp', 'menubar=no,toolbar=no,status=no');
    }

    var reader = new window.FileReader(),
    base64data = '';
    reader.readAsDataURL(blob);
    reader.onloadend = function() {
      base64data = reader.result;
      var research_copy = {};
      if (!opt_out) {
        research_copy = {
          'timeline_json_data': timeline_json_data,
          'name':'timeline_story.gif',
          'usage_log': usage_log,
          'image': base64data,
          'email_address': email_address,
          'timestamp': new Date().valueOf()
        };
      }
      else {
        research_copy = {
          'usage_log': usage_log,
          'email_address': email_address,
          'timestamp': new Date().valueOf()
        };
      }
      var research_copy_json = JSON.stringify(research_copy);
      var research_blob = new Blob([research_copy_json], {type: "application/json"});

      console.log(research_copy);

      socket.emit('export_event', research_copy_json); // raise an event on the server
    }

    gif.running = false;

  });

  // timeline_frame_opacity = .2; // opactity of timeline svg. to be adapted if image is loaded.

  import_div = d3.select("body")
  .append("div")
  .attr("id","import_div")
  .attr("class","control_div")
  .style("top","25%");

  export_div = d3.select("body")
  .append("div")
  .attr("id","export_div")
  .attr("class","control_div")
  .style("top",-185 + "px");

  menu_div =  d3.select("body")
  .append("div")
  .attr("id","menu_div")
  .attr("class","control_div");

  menu_div.append("text")
  .attr("class","menu_label")
  .text("Open");

  menu_div.append('input')
  .attr({
    type: "image",
    name: "Load timeline data",
    id: "import_visible_btn",
    class: 'img_btn_enabled',
    src: 'img/open.png',
    height: 30,
    width: 30,
    title: "Load timeline data"
  })
  .on('click', function() {

    d3.select("#filter_div").style("display","none");
    d3.select("#caption_div").style("display","none");
    d3.select("#image_div").style("display","none");
    d3.select("#export_div").style("top",-185 + "px");

    console.log("open import panel");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "load",
      event_detail: "open import panel"
    }
    usage_log.push(log_event);

    if (d3.select("#import_div").style("top") != -210 + "px") {
      d3.select("#import_div").style("top",-210 + "px");
      d3.select("#gdocs_info").style("height",0 + "px");
      d3.selectAll(".gdocs_info_element").style("display","none");
    }
    else
    d3.select("#import_div").style("top","25%");
  });

  var control_panel = menu_div.append('g')
  .attr('id','control_panel');

  control_panel.append("hr")
  .attr("class","menu_hr");

  control_panel.append("text")
  .attr("class","menu_label")
  .style("font-size","9px")
  .text("Annotate");

  control_panel.append('input')
  .style("margin-bottom","0px")
  .attr({
    type: "image",
    name: "Add caption",
    class: 'img_btn_disabled',
    src: 'img/caption.png',
    height: 30,
    width: 30,
    title: "Add caption"
  })
  .on('click', function() {

    console.log("open caption dialog");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "open caption dialog"
    }
    usage_log.push(log_event);

    d3.select("#filter_div").style("display","none");
    d3.select("#image_div").style("display","none");
    if (d3.select("#caption_div").style("display") != "none") {
      d3.select("#caption_div").style("display","none");
    }
    else {
      d3.select("#caption_div").style("display","inline");
    }
  });

  control_panel.append('input')
  .attr({
    type: "image",
    name: "Add image",
    class: 'img_btn_disabled',
    src: 'img/image.png',
    height: 30,
    width: 30,
    title: "Add image"
  })
  .style("margin-bottom","0px")
  .on('click', function() {

    console.log("open image dialog");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "open image dialog"
    }
    usage_log.push(log_event);

    d3.select("#filter_div").style("display","none");
    d3.select("#caption_div").style("display","none");
    if (d3.select("#image_div").style("display") != "none") {
      d3.select("#image_div").style("display","none");
    }
    else {
      d3.select("#image_div").style("display","inline");
    }
  });

  control_panel.append('input')
  .attr({
    type: "image",
    name: "Clear labels, captions, & images",
    class: 'img_btn_disabled',
    src: 'img/clear.png',
    height: 30,
    width: 30,
    title: "Clear annotations, captions, & images"
  })
  .on('click', function() {

    console.log("clear annotations");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "clear annotations"
    }
    usage_log.push(log_event);

    main_svg.selectAll(".timeline_caption").remove();

    main_svg.selectAll(".timeline_image").remove();

    main_svg.selectAll(".event_annotation").remove();

    d3.selectAll('.timeline_event_g').each(function () {
      this.__data__.selected = false;
    });

    d3.selectAll(".event_span")
    .attr("filter", "none")
    .style("stroke","#fff")
    .style("stroke-width","0.25px");

    d3.selectAll(".event_span_component")
    .style("stroke","#fff")
    .style("stroke-width","0.25px");
  });

  /**
  ---------------------------------------------------------------------------------------
  FILTER TYPE OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  control_panel.append("hr")
  .attr("class","menu_hr");

  control_panel.append("text")
  .attr("class","menu_label")
  .text("Filter");

  //filter type options
  var filter_type_picker = control_panel.append("g")
  .attr("id","filter_type_picker");

  var filter_type_rb = filter_type_picker.selectAll("g")
  .data(["Highlight","Hide"])
  .enter();

  var filter_type_rb_label = filter_type_rb.append("label")
  .attr("class", "menu_rb");

  filter_type_rb_label.append("input")
  .attr({
    type: "radio",
    name: "filter_type_rb",
    value: function (d) {
      return d;
    }
  })
  .property("disabled",true)
  .property("checked", function (d) {
    return d == "Highlight";
  });

  filter_type_rb_label.append("img")
  .attr({
    class: "img_btn_disabled",
    height: 30,
    width: 30,
    title: function (d) {
      return d;
    },
    src: function (d) {
      if (d == "Highlight")
      return 'img/highlight.png';
      else
      return 'img/filter.png';
    }
  })
  .style("margin-bottom","0px")
  .on("click", function(){

    console.log("open filter dialog");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "filter",
      event_detail: "open filter dialog"
    }
    usage_log.push(log_event);

    if (d3.select(this).attr("class") == "img_btn_enabled"){
      d3.select("#caption_div").style("display","none");
      d3.select("#image_div").style("display","none");
      if (d3.select("#filter_div").style("display") == "none")
      d3.select("#filter_div").style("display","inline");
      else
      d3.select("#filter_div").style("display","none");
    }
  });

  d3.selectAll("#filter_type_picker input[name=filter_type_rb]").on("change", function() {

    d3.select("#filter_div").style("display", "inline");

    console.log("filter type changed: " + this.value);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "filter",
      event_detail: "filter type changed: " + this.value
    }
    usage_log.push(log_event);

    filter_type = this.value;
    if (filter_type == "Hide") {
      var trigger_remove_filter = false;
      if (selected_categories[0].length != 1 || selected_categories[0][0].value != "( All )") {
        trigger_remove_filter = true;
      }
      else if (selected_facets[0].length != 1 || selected_facets[0][0].value != "( All )"){
        trigger_remove_filter = true;
      }
      else if (selected_segments[0].length != 1 || selected_segments[0][0].value != "( All )"){
        trigger_remove_filter = true;
      }

      if (trigger_remove_filter) {
        dispatch.highlight(d3.select("#category_picker").select("option"), d3.select("#facet_picker").select("option"), d3.select("#segment_picker").select("option"));
        dispatch.remove(selected_categories, selected_facets, selected_segments);
      }
    }
    else if (filter_type == "Highlight") {
      active_data = all_data;
      var trigger_remove_filter = false;
      if (selected_categories[0].length != 1 || selected_categories[0][0].value != "( All )") {
        trigger_remove_filter = true;
      }
      else if (selected_facets[0].length != 1 || selected_facets[0][0].value != "( All )"){
        trigger_remove_filter = true;
      }
      else if (selected_segments[0].length != 1 || selected_segments[0][0].value != "( All )"){
        trigger_remove_filter = true;
      }
      if (trigger_remove_filter) {
        dispatch.remove(d3.select("#category_picker").select("option"), d3.select("#facet_picker").select("option"), d3.select("#segment_picker").select("option"));
        dispatch.highlight(selected_categories, selected_facets, selected_segments);
      }
    }
  });

  /**
  ---------------------------------------------------------------------------------------
  EXPORT OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  d3.select("#export_div").append('input')
  .attr({
    type: "image",
    name: "Hide export panel",
    id: "export_close_btn",
    class: 'img_btn_enabled',
    src: 'img/close.png',
    height: 15,
    width: 15,
    title: "Hide export panel"
  })
  .style('margin-top','5px')
  .on('click', function() {
    d3.select("#export_div").style("top",-185 + "px");

    console.log("hide export panel");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "export",
      event_detail: "hide export panel"
    }
    usage_log.push(log_event);
  });

  control_panel.append("hr")
  .style("margin-bottom","0px")
  .attr("class","menu_hr");

  control_panel.append("text")
  .attr("class","menu_label")
  .text("Export");

  control_panel.append('input')
  .attr({
    type: "image",
    name: "Export",
    class: 'img_btn_disabled',
    src: 'img/export.png',
    height: 30,
    width: 30,
    title: "Export"
  })
  .on('click', function() {

    d3.select("#filter_div").style("display","none");
    d3.select("#caption_div").style("display","none");
    d3.select("#image_div").style("display","none");
    d3.select("#import_div").style("top",-210 + "px");

    console.log("show export panel");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "export",
      event_detail: "show export panel"
    }
    usage_log.push(log_event);

    if (d3.select("#export_div").style("top") != -185 + "px") {
      d3.select("#export_div").style("top",-185 + "px");
    }
    else
    d3.select("#export_div").style("top","25%");
  });

  export_div.append('div')
  .attr('id','export_boilerplate')
  .style('height','120px')
  .html("<span class='boilerplate_title'>Export options</span><hr>" +
  "<span class='disclaimer_text'>By providing an email address you agree that <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> may contact you to request feedback and for user research.<br>"+
  "You may withdraw this consent at any time.</span><hr>")

  var export_formats = export_div.append('div')
  .attr('id','export_formats');

  export_formats.append("input")
  .attr({
    type: 'text',
    placeholder: "email address",
    class: "text_input",
    id: "email_input"
  })
  .on('input',function() {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (re.test(d3.select("#email_input").property("value"))) {
      email_address = d3.select("#email_input").property("value");
      export_formats.selectAll(".img_btn_disabled")
      .attr("class","img_btn_enabled")

      console.log("valid email address: " + email_address);

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "valid email address: " + email_address
      }
      usage_log.push(log_event);
    }
    else {
      export_formats.selectAll(".img_btn_enabled")
      .attr("class","img_btn_disabled")
    }
  });

  export_formats.append('input')
  .attr({
    type: "image",
    name: "Export PNG",
    class: 'img_btn_disabled',
    src: 'img/png.png',
    height: 30,
    width: 30,
    title: "Export PNG"
  })
  .on('click', function() {

    console.log("exporting main_svg as PNG");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "export",
      event_detail: "exporting main_svg as PNG"
    }
    usage_log.push(log_event);

    saveSvgAsPng(document.getElementById("main_svg"), "timeline_image.png", {backgroundColor: "white"});

  });

  export_formats.append('input')
  .attr({
    type: "image",
    name: "Export SVG",
    class: 'img_btn_disabled',
    src: 'img/svg.png',
    height: 30,
    width: 30,
    title: "Export SVG"
  })
  .on('click', function() {

    console.log("exporting main_svg as SVG");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "export",
      event_detail: "exporting main_svg as SVG"
    }
    usage_log.push(log_event);

    saveSvg(document.getElementById("main_svg"), "timeline_image.svg", {backgroundColor: "white"});
  });

  export_formats.append('input')
  .attr({
    type: "image",
    name: "Export animated GIF",
    class: 'img_btn_disabled',
    src: 'img/gif.png',
    height: 30,
    width: 30,
    title: "Export animated GIF"
  })
  .on('click', function() {

    gif.frames = [];
    var gif_scenes = scenes;
    if (gif_scenes.length > 0) {

      console.log("exporting story as animated GIF");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "exporting story as animated GIF"
      }
      usage_log.push(log_event);

      gif_scenes.sort(function(a, b) {
        return parseFloat(a.s_order) - parseFloat(b.s_order);
      });
      gif_scenes.forEach(function (d,i){
        var img =  document.createElement('img');
        img.style.display = "none";
        img.id = "gif_frame" + i;
        img.src = d.s_src;
        document.body.appendChild(img);
        d3.select("#gif_frame" + i).attr('class','gif_frame');
        setTimeout(function () {
          gif.addFrame(document.getElementById('gif_frame' + i), {delay: 1000});
        },150)
      })
    }
    else {

      console.log("exporting main_svg as GIF");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "exporting main_svg as GIF"
      }
      usage_log.push(log_event);

      svgAsPNG(document.getElementById("main_svg"), -1, {backgroundColor: "white"});

      setTimeout(function () {
        gif.addFrame(document.getElementById('gif_frame-1'));
      },150)
    }
    setTimeout(function () {
      gif.render();
      d3.selectAll('.gif_frame').remove();
    },150 + 150 * gif.frames.length)
    gif_scenes = [];
  });

  export_formats.append('input')
  .attr({
    type: "image",
    name: "Export story",
    class: 'img_btn_disabled',
    src: 'img/story.png',
    height: 30,
    width: 30,
    title: "Export story"
  })
  .on('click', function() {
    console.log('exporting story as .cdc');

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "export",
      event_detail: 'exporting story as .cdc'
    }
    usage_log.push(log_event);

    if (!opt_out) {
      timeline_story = {
        'timeline_json_data':timeline_json_data,
        'name':"timeline_story.cdc",
        'scenes':scenes,
        'usage_log': usage_log,
        'caption_list':caption_list,
        'annotation_list':annotation_list,
        'image_list':image_list,
        'author':email_address,
        'timestamp':new Date().valueOf()
      };
    }
    else {
      timeline_story = {
        'usage_log': usage_log,
        'author':email_address,
        'timestamp':new Date().valueOf()
      };
    }
    var story_json = JSON.stringify(timeline_story);
    var blob = new Blob([story_json], {type: "application/json"});
    var url  = URL.createObjectURL(blob);

    console.log(story_json);
    socket.emit('export_event', story_json); // raise an event on the server

    var a = document.createElement('a');
    a.download    = "timeline_story.cdc";
    a.href        = url;
    a.textContent = "Download timeline_story.cdc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  });

  var out_out_cb = export_formats.append("div")
  .attr("id","opt_out_div");

  out_out_cb.append("input")
  .attr({
    type: "checkbox",
    name: "opt_out_cb",
    value: opt_out
  })
  .property("checked", false)
  .on('change', function() {
    if (!opt_out) {

      console.log("opting out of sharing content");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "opting out of sharing"
      }
      usage_log.push(log_event);

      opt_out = true;
      export_formats.selectAll(".img_btn_disabled")
      .attr("class","img_btn_enabled")
    }
    else {
      opt_out = false;

      console.log("opting into sharing content");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "opting into of sharing"
      }
      usage_log.push(log_event);

      export_formats.selectAll(".img_btn_enabled")
      .attr("class","img_btn_disabled")
    }
  });

  out_out_cb.append("label")
  .attr("class","menu_label")
  .attr("for","opt_out_cb")
  .style('vertical-align','text-top')
  .text("Don't share content with Microsoft");


  /**
  ---------------------------------------------------------------------------------------
  OPTIONS DIV
  ---------------------------------------------------------------------------------------
  **/

  option_div = d3.select("body")
  .append("div")
  .attr("id","option_div")
  .attr("class","control_div");

  /**
  ---------------------------------------------------------------------------------------
  CAPTION OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  caption_div = d3.select("body")
  .append("div")
  .attr("id","caption_div")
  .attr("class","annotation_div control_div")
  .style("display","none");

  /**
  ---------------------------------------------------------------------------------------
  IMAGE OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  image_div = d3.select("body")
  .append("div")
  .attr("id","image_div")
  .attr("class","annotation_div control_div")
  .style("display","none");

  /**
  --------------------------------------------------------------------------------------
  DATASETS
  --------------------------------------------------------------------------------------
  **/

  var logo_div = d3.select("body").append("div")
  .attr("id","logo_div")
  .html("<a href='https://microsoft.com'><img class='ms-logo' src='img/ms-logo.svg'></a>");

  var footer = d3.select("body").append("div")
  .attr("id","footer");

  footer.append("div")
  .attr("id","footer_left")
  .html("<span class='footer_text_left'><a title=About & getting started' href='/about/' target='_blank'>About & getting started</a></span> <span class='footer_text_left'><a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'>Contact the project team</a>");

  footer.append("div")
  .attr("id","footer_right")
  .html("<span class='footer_text'><a title='Privacy & cookies' href='https://go.microsoft.com/fwlink/?LinkId=521839' target='_blank'>Privacy & cookies</a></span><span class='footer_text'><a title='Terms of use' href='https://go.microsoft.com/fwlink/?LinkID=760869' target='_blank'>Terms of use</a></span><span class='footer_text'><a title='Trademarks' href='http://go.microsoft.com/fwlink/?LinkId=506942' target='_blank'>Trademarks</a></span><span class='footer_text'><a title='About our ads' href='http://choice.microsoft.com/' target='_blank'>About our ads</a></span><span class='footer_text'>© 2017 Microsoft</span>");

  var boilerplate = d3.select("#import_div").append("div")
  .attr("id","boilerplate")
  .html("<span class='boilerplate_title'>Timeline Storyteller (Alpha release)</span>");

  boilerplate.append('input')
  .attr({
    type: "image",
    name: "Hide import panel",
    id: "import_close_btn",
    class: 'img_btn_enabled',
    src: 'img/close.png',
    height: 15,
    width: 15,
    title: "Hide import panel"
  })
  .style('margin-top','5px')
  .on('click', function() {

    console.log("hiding import panel")

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "load",
      event_detail: "hiding import panel"
    }
    usage_log.push(log_event);

    d3.select("#import_div").style("top",-210 + "px");
    d3.select("#gdocs_info").style("height",0 + "px");
    d3.selectAll(".gdocs_info_element").style("display","none");
  });

  var data_picker = d3.select("#import_div").append("div")
  .attr("id","data_picker");

  var dataset_picker = d3.select("#data_picker").append("div")
  .attr("class","data_story_picker");

  dataset_picker.append("text")
  .attr("class","ui_label")
  .text("Load timeline data");

  var demo_dataset_picker_label = dataset_picker.append("label")
  .attr("class","import_label");

  var showDropdown = function (element) {
    var event = document.createEvent('MouseEvents');
    event.initMouseEvent('mousedown', true, true, window);
    element.dispatchEvent(event);
  }

  demo_dataset_picker_label.append("select")
  .attr("id","demo_dataset_picker")
  .attr("title","Load demo dataset")
  .on('change', function () {
    source = d3.select(this).property('value');
    if (source != ''){

      source_format = 'demo_json';
      setTimeout(function () {

        console.log("loading " + source + " (" + source_format + ")")

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "load",
          event_detail: "loading " + source + " (" + source_format + ")"
        }
        usage_log.push(log_event);

        loadTimeline();
      },500);
    }
  })
  .selectAll("option")
  .data([
    {"path":"","tl_name":""},
    {"path":"priestley","tl_name":"Priestley's Chart of Biography (faceted by occupation)"},
    {"path":"philosophers","tl_name":"Great Philosophers since the 8th Century BC (faceted by region)"},
    {"path":"empires","tl_name":"History's Largest Empires (faceted by region)"},
    {"path":"ch_jp_ko","tl_name":"East Asian Dynasties (faceted by region)"},
    {"path":"epidemics","tl_name":"Epidemics since the 14th Century (faceted by region)"},
    {"path":"prime_ministers","tl_name":"Prime Ministers of Canada"},
    {"path":"france_presidents","tl_name":"Presidents of France"},
    {"path":"germany_chancellors","tl_name":"Chancellors of Germany"},
    {"path":"italy_presidents","tl_name":"Presidents of Italy"},
    {"path":"japan_prime_ministers","tl_name":"Prime Ministers of Japan"},
    {"path":"uk_prime_ministers","tl_name":"Prime Ministers of the UK"},
    {"path":"presidents","tl_name":"Presidents of the USA"},
    {"path":"heads_of_state","tl_name":"G7 Heads of State (faceted by country)"},
    {"path":"heads_of_state_since_1940","tl_name":"G7 Heads of State since 1940 (faceted by country)"},
    {"path":"hurricanes10y", "tl_name":"C4-5 Hurricanes: 2001-2010"},
    {"path":"hurricanes50y", "tl_name":"C4-5 Hurricanes: 1960-2010"},
    {"path":"hurricanes100y", "tl_name":"C4-5 Hurricanes: 1910-2010"},
    {"path":"dailyroutines","tl_name":"Podio's 'Daily Routines of Famous Creative People' (faceted by person)"},
    {"path":"painters","tl_name":"Accurat's 'Visualizing painters' lives' (faceted by painter)"},
    {"path":"authors","tl_name":"Accurat's 'From first published to masterpieces' (faceted by author)"},
    {"path":"singularity","tl_name":"Kurzweil's 'Countdown to Singularity' (4 billion years)"},
    {"path":"perspective_on_time","tl_name":"Wait But Why's 'A Perspective on Time' (14 billion years)"},
    {"path":"typical_american","tl_name":"Wait But Why's 'Life of a Typical American'"}
  ])
  .enter()
  .append("option")
  .attr("value", function(d) { return d.path; })
  .text(function(d) { return d.tl_name; });

  demo_dataset_picker_label.append("img")
  .attr({
    name: "Load Demo Data",
    id: "demo_dataset_picker_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load Demo Data",
    src: "img/demo.png"
  })
  .on('click', function(){
    var se = document.getElementById('demo_dataset_picker');
    showDropdown(se);
  });

  dataset_picker.append("input")
  .attr({
    type: "file",
    id: "json_uploader",
    class: "inputfile",
    accept:".json"
  })
  .on("change", function () {

    var file = this.files[0];
    reader.readAsText(file);

    reader.onload = function(e) {
      var contents = e.target.result;
      var blob = new Blob([contents], {type: "application/json"});
      source = URL.createObjectURL(blob);
      source_format = 'json';
      setTimeout(function () {

        console.log("loading " + source + " (" + source_format + ")")

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "load",
          event_detail: "loading " + source + " (" + source_format + ")"
        }
        usage_log.push(log_event);

        loadTimeline();
      },500);
    };
  });

  dataset_picker.append("label")
  .attr("for","json_uploader")
  .attr("class","import_label")
  .append("img")
  .attr({
    name: "Load from JSON",
    id: "json_picker_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load from JSON",
    src: "img/json.png"
  });

  dataset_picker.append("input")
  .attr({
    type: "file",
    id: "csv_uploader",
    class: "inputfile",
    accept: ".csv"
  })
  .on("change", function () {

    var file = this.files[0];
    reader.readAsText(file);

    reader.onload = function(e) {
      var contents = e.target.result;
      var blob = new Blob([contents], {type: "application/csv"});
      source = URL.createObjectURL(blob);
      source_format = 'csv';
      setTimeout(function () {

        console.log("loading " + source + " (" + source_format + ")")

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "load",
          event_detail: "loading " + source + " (" + source_format + ")"
        }
        usage_log.push(log_event);

        loadTimeline();
      },500);
    };
  });

  dataset_picker.append("label")
  .attr("for","csv_uploader")
  .attr("class","import_label")
  .append("img")
  .attr({
    name: "Load from CSV",
    id: "csv_picker_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load from CSV",
    src: "img/csv.png"
  });

  dataset_picker.append("input")
  .attr({
    id: "gdocs_uploader",
    class: "inputfile"
  })
  .on("click", function () {

    if (d3.selectAll(".gdocs_info_element").style("display") != "none") {
      d3.select("#gdocs_info").style("height",0 + "px");
      d3.selectAll(".gdocs_info_element").style("display","none");
    }
    else {
      d3.select("#gdocs_info").style("height",25 + "px");
      setTimeout(function () {
        d3.selectAll(".gdocs_info_element").style("display","inline");
      },500);
    }
  });

  dataset_picker.append("label")
  .attr("for","gdocs_uploader")
  .attr("class","import_label")
  .append("img")
  .attr({
    name: "Load from Google Spreadsheet",
    id: "gdocs_picker_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load from Google Spreadsheet",
    src: "img/gdocs.png"
  });

  var story_picker = d3.select("#data_picker").append("div")
  .attr("class","data_story_picker")
  .style('border-right','1px solid transparent');

  story_picker.append("text")
  .attr("class","ui_label")
  .text("Load timeline story");

  story_picker.append("input")
  .attr({
    id: "story_demo",
    class: "inputfile"
  })
  .on("click", function () {

    source = 'demoStory';
    console.log('demo story source');

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "load",
      event_detail: 'demo story source'
    }
    usage_log.push(log_event);

    source_format = 'demo_story';
    d3.select("#timeline_metadata").style('display','none');
    d3.selectAll(".gdocs_info_element").style("display","none");
    d3.select("#import_div").style("top",-210 + "px");
    d3.select("#gdocs_info").style("height",0 + "px");
    d3.select("#gdoc_spreadsheet_key_input").property("value","");
    d3.select("#gdoc_worksheet_title_input").property("value","");

    setTimeout(function () {
      loadTimeline();
    },500);
  });

  story_picker.append("label")
  .attr("for","story_demo")
  .attr("class","import_label")
  .append("img")
  .attr({
    name: "Load Demo Story",
    id: "story_demo_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load Demo Story",
    src: "img/demo.png"
  });

  story_picker.append("input")
  .attr({
    type: "file",
    id: "story_uploader",
    class: "inputfile",
    accept:".cdc"
  })
  .on("change", function () {

    var file = this.files[0];
    reader.readAsText(file);

    reader.onload = function(e) {
      var contents = e.target.result;
      var blob = new Blob([contents], {type: "application/json"});
      source = URL.createObjectURL(blob);
      console.log('story source: ' + source);

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "load",
        event_detail: 'story source: ' + source
      }
      usage_log.push(log_event);

      source_format = 'story';
      d3.select("#timeline_metadata").style('display','none');
      d3.selectAll(".gdocs_info_element").style("display","none");
      d3.select("#import_div").style("top",-210 + "px");
      d3.select("#gdocs_info").style("height",0 + "px");
      d3.select("#gdoc_spreadsheet_key_input").property("value","");
      d3.select("#gdoc_worksheet_title_input").property("value","");

      setTimeout(function () {
        loadTimeline();
      },500);
    };
  });

  story_picker.append("label")
  .attr("for","story_uploader")
  .attr("class","import_label")
  .append("img")
  .attr({
    name: "Load Saved Story",
    id: "story_picker_label",
    class: "img_btn_enabled import_label",
    height: 40,
    width: 40,
    title: "Load Saved Story",
    src: "img/story.png"
  });

  var gdocs_info = d3.select("#import_div").append("div")
  .attr("id","gdocs_info");

  gdocs_info.append("div")
  .attr("id","gdoc_spreadsheet_key_div")
  .attr("class","gdocs_info_element")
  .append("input")
  .attr({
    type: 'text',
    placeholder: "Spreadsheet Key",
    class: "text_input",
    id: "gdoc_spreadsheet_key_input"
  });

  gdocs_info.append("div")
  .attr("class","gdocs_info_element")
  .append("input")
  .attr({
    type: 'text',
    placeholder: "Worksheet Title",
    class: "text_input",
    id: "gdoc_worksheet_title_input"
  });

  gdocs_info.append("div")
  .attr("id","gdoc_spreadsheet_confirm_div")
  .attr("class","gdocs_info_element")
  .append("input")
  .attr({
    type: "image",
    name: "Confirm Google Spreadsheet Data",
    id: "confirm_gdocs_btn",
    class: 'img_btn_enabled',
    src: 'img/check.png',
    height: 20,
    width: 20,
    title: "Confirm Google Spreadsheet Data"
  })
  .on('click', function() {

    gdoc_key = d3.select("#gdoc_spreadsheet_key_input").property("value");
    gdoc_worksheet = d3.select("#gdoc_worksheet_title_input").property("value");
    console.log("gdoc spreadsheet " + gdoc_worksheet + " added using key \"" + gdoc_key + "\"");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "load",
      event_detail: "gdoc spreadsheet " + gdoc_worksheet + " added using key \"" + gdoc_key + "\""
    }
    usage_log.push(log_event);

    source_format = 'gdoc';
    gsheets.getWorksheet(gdoc_key,gdoc_worksheet,function(err,sheet) {

      if (err != null) {
        alert(err);
        return true;
      };

      timeline_json_data = sheet.data;
      source_format = 'gdoc';
      setTimeout(function () {
        loadTimeline();
      },500);
    });

  });

  var disclaimer = d3.select("#import_div").append("div")
  .attr("id","disclaimer")
  .html("<span class='disclaimer_title'><br>A note about privacy:</span><br>" +
  "<span class='disclaimer_text'>This service enables you to create visually compelling timeline stories. Your data remains on your machine and is not shared with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> unless you export the content you create and provide your email address. If you share your content with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>, we will use it for research and to improve our products and services. We may also include it in a future research publication." +
  "<br>By using this service, you agree to <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>'s <a title='Privacy' href='https://go.microsoft.com/fwlink/?LinkId=521839'>Privacy Statement</a> and <a title='Terms of Use' href='https://go.microsoft.com/fwlink/?LinkID=760869'>Terms of Use</a>.</span>");

  var timeline_metadata = d3.select("#import_div").append("div")
  .attr("id","timeline_metadata")
  .style('display','none');

  var timeline_metadata_contents = timeline_metadata.append("div")
  .attr("id","timeline_metadata_contents");

  timeline_metadata.append("div")
  .attr({
    id: "draw_timeline",
    class: "img_btn_enabled import_label",
    title: "Draw Timeline"
  })
  .on("click", function () {
    d3.select("#timeline_metadata").style('display','none');
    d3.selectAll(".gdocs_info_element").style("display","none");
    d3.select("#import_div").style("top",-210 + "px");
    d3.select("#gdocs_info").style("height",0 + "px");
    d3.select("#gdoc_spreadsheet_key_input").property("value","");
    d3.select("#gdoc_worksheet_title_input").property("value","");
    drawTimeline (active_data);
    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());
  })
  .append("text")
  .attr("class","ui_label")
  .style("color","black")
  .style("cursor","pointer")
  .style("position","relative")
  .style("font-weight","bold")
  .style("vertical-align","baseline")
  .text("Click here to draw this timeline.");

  /**
  --------------------------------------------------------------------------------------
  TIMELINE CONFIG OPTIONS UI
  --------------------------------------------------------------------------------------
  **/

  var option_picker = d3.select("#option_div");

  //representation options
  var representation_picker = option_picker.append("div")
  .attr("class","option_picker")
  .attr("id","representation_picker");

  representation_picker.append("text")
  .attr("class","ui_label")
  .text("Timeline representation");

  var representation_rb = representation_picker.selectAll("div")
  .data(representations)
  .enter();

  var representation_rb_label = representation_rb.append("label")
  .attr("class", "option_rb");

  representation_rb_label.append("input")
  .attr({
    type: "radio",
    name: "representation_rb",
    value: function (d) {
      return d.name;
    }
  })
  .property("checked", function (d) {
    return d.name == timeline_vis.tl_representation();
  })
  .property("disabled", true);

  representation_rb_label.append("img")
  .attr({
    height: 40,
    width: 40,
    class: "img_btn_disabled",
    title: function (d) {
      return d.hint;
    },
    src: function (d) {
      return d.icon;
    }
  });

  representation_rb_label.append("span")
  .attr("class","option_rb_label")
  .text(function(d){
    return d.name;
  });

  //scale options
  var scale_picker = option_picker.append("div")
  .attr("class","option_picker")
  .attr("id","scale_picker");

  scale_picker.append("text")
  .attr("class","ui_label")
  .text("Scale");

  var scale_rb = scale_picker.selectAll("div")
  .data(scales)
  .enter();

  var scale_rb_label = scale_rb.append("label")
  .attr("class", "option_rb");

  scale_rb_label.append("input")
  .attr({
    type: "radio",
    name: "scale_rb",
    value: function (d) {
      return d.name;
    }
  })
  .property("checked", function (d) {
    return d.name == timeline_vis.tl_scale();
  })
  .property("disabled", true);

  scale_rb_label.append("img")
  .attr({
    height: 40,
    width: 40,
    class: "img_btn_disabled",
    title: function (d) {
      return d.hint;
    },
    src: function (d) {
      return d.icon;
    }
  });

  scale_rb_label.append("span")
  .attr("class","option_rb_label")
  .text(function(d){
    return d.name;
  });

  //layout options
  var layout_picker = option_picker.append("div")
  .attr("class","option_picker")
  .style("border-right", "none")
  .attr("id","layout_picker");

  layout_picker.append("text")
  .attr("class","ui_label")
  .text("Layout");

  var layout_rb = layout_picker.selectAll("div")
  .data(layouts)
  .enter();

  var layout_rb_label = layout_rb.append("label")
  .attr("class", "option_rb");

  layout_rb_label.append("input")
  .attr({
    type: "radio",
    name: "layout_rb",
    value: function (d) {
      return d.name;
    }
  })
  .property("checked", function (d) {
    return d.name == timeline_vis.tl_layout();
  })
  .property("disabled", true);

  layout_rb_label.append("img")
  .attr({
    height: 40,
    width: 40,
    class: "img_btn_disabled",
    title: function (d) {
      return d.hint;
    },
    src: function (d) {
      return d.icon;
    }
  });

  layout_rb_label.append("span")
  .attr("class","option_rb_label")
  .text(function(d){
    return d.name;
  });

  d3.select("#caption_div").append("textarea")
  .attr({
    cols: 37,
    rows: 5,
    placeholder: "Caption text",
    class: "text_input",
    maxlength: 140,
    id: "add_caption_text_input"
  });

  d3.select("#caption_div").append('input')
  .attr({
    type: "image",
    name: "Add Caption",
    id: "add_caption_btn",
    class: 'img_btn_enabled',
    src: 'img/check.png',
    height: 20,
    width: 20,
    title: "Add Caption"
  })
  .on('click', function() {
    d3.select("#caption_div").style("display","none");
    var caption = d3.select("#add_caption_text_input").property("value");
    console.log("caption added: \"" + caption + "\"");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "caption added: <<" + caption + ">>"
    }
    usage_log.push(log_event);

    var caption_list_item = {
      id: "caption" + caption_index,
      c_index: caption_index,
      caption_text: caption,
      x_rel_pos: 0.5,
      y_rel_pos: 0.25,
      caption_width: d3.min([caption.length * 10,100])
    };

    caption_list.push(caption_list_item);

    addCaption(caption,d3.min([caption.length * 10,100]),0.5,0.25,caption_index);
    caption_index++;
    d3.select("#add_caption_text_input").property("value","");
  });

  d3.select("#image_div").append("input")
  .attr({
    type: 'text',
    placeholder: "Image URL",
    class: "text_input",
    id: "add_image_link"
  });

  d3.select("#image_div").append('input')
  .attr({
    type: "image",
    name: "Add Image",
    id: "add_image_btn",
    class: 'img_btn_enabled',
    src: 'img/check.png',
    height: 20,
    width: 20,
    title: "Add Image"
  })
  .on('click', function() {
    d3.select("#image_div").style("display","none");
    var image_url = d3.select("#add_image_link").property("value");
    console.log("image " + image_index + " added: <<" + image_url + ">>");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "image " + image_index + " added: <<" + image_url + ">>"
    }
    usage_log.push(log_event);

    var new_image = new Image();
    new_image.name = image_url;
    new_image.onload = getWidthAndHeight;
    new_image.onerror = loadFailure;
    new_image.src = image_url;

    function loadFailure() {
      console.log("'" + this.name + "' failed to load.");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "annotation",
        event_detail: "'" + this.name + "' failed to load."
      }
      usage_log.push(log_event);

      return true;
    }

    function getWidthAndHeight() {
      console.log("image " + image_index + " is " + this.width + " by " + this.height + " pixels in size.");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "annotation",
        event_detail: "image" + image_index + " is " + this.width + " by " + this.height + " pixels in size."
      }
      usage_log.push(log_event);

      var image_width = this.width,
      image_height = this.height,
      scaling_ratio = 1;

      //reduce size of large images
      if (image_width >= width * 0.5) {
        image_width = width * 0.5;
        scaling_ratio = image_width / this.width;
        image_height = this.height * scaling_ratio;
      }
      if (image_height >= height * 0.5) {
        image_height = height * 0.5;
        scaling_ratio = image_height / this.height;
        image_width = this.width * scaling_ratio;
      }

      var image_list_item = {
        id: "image" + image_index,
        i_index: image_index,
        i_url: image_url,
        i_width: image_width,
        i_height: image_height,
        x_rel_pos: 0.5,
        y_rel_pos: 0.25,
      };

      image_list.push(image_list_item);
      addImage(image_url,0.5,0.25,image_width,image_height,image_index);
      image_index++;
    }
    d3.select("#add_image_link").property("value","");

  });

  /**
  --------------------------------------------------------------------------------------
  MAIN PREPROCESSING
  --------------------------------------------------------------------------------------
  **/

  function loadTimeline () {

    d3.select("#disclaimer").style('display','none');
    control_panel.selectAll("input").attr("class","img_btn_disabled")
    d3.select("#filter_type_picker").selectAll("input").property("disabled",true);
    d3.select("#filter_type_picker").selectAll("img").attr("class","img_btn_disabled");
    d3.select('#playback_bar').selectAll('img').attr('class','img_btn_disabled');
    d3.selectAll(".option_rb").select("input").property("disabled","true");
    d3.selectAll(".option_rb").select("img").attr("class","img_btn_disabled");
    d3.selectAll('.option_rb img').style('border','2px solid transparent');
    d3.select("#menu_div").style("left",-50 + "px");
    d3.select("#navigation_div").style("bottom", -100 + "px");

    if (main_svg != undefined) {
      console.clear();
      main_svg.remove();
      filter_div.remove();
      navigation_div.remove();
      timeline_vis.prev_tl_representation("None");

      if (source_format != 'story') {
        caption_index = 0;
        image_index = 0;
        scenes = [];
        caption_list = [];
        image_list = [];
        annotation_list = [];
        timeline_vis.tl_scale("Chronological")
        .tl_layout("Unified")
        .tl_representation("Linear")
        d3.selectAll('.gif_frame').remove()
        timeline_vis.resetCurve();
      }
    }

    if (legend_panel != undefined) {
      legend_panel.remove();
    }

    filter_div = d3.select("body")
    .append("div")
    .attr("id","filter_div")
    .attr("class","control_div")
    .style("display","none");

    //initialize global variables accessed by multiple visualziations
    date_granularity = "years";
    max_num_tracks = 0;
    max_end_age = 0;
    max_num_seq_tracks = 0;
    legend_rect_size = unit_width;
    legend_spacing = 5;
    categories = d3.scale.ordinal(); //scale for event types
    facets = d3.scale.ordinal(); //scale for facets (timelines)
    segments = d3.scale.ordinal(); //scale for segments
    present_segments = d3.scale.ordinal();
    num_categories = 0;
    num_facets = 0;
    timeline_facets = [];

    main_svg = d3.select("body")
    .append("svg")
    .attr("id", "main_svg");
    // .style("top", d3.select("#option_div")[0][0].getBoundingClientRect().height);

    navigation_div = d3.select("body")
    .append("div")
    .attr("id","navigation_div")
    .attr("class","control_div");

    var playback_bar = navigation_div.append("div")
    .attr("id","playback_bar");

    playback_bar.append("div")
    .attr("id","record_scene_div")
    .attr('class','nav_bttn')
    .append('img')
    .attr({
      id: "record_scene_btn",
      class: 'img_btn_disabled',
      src: 'img/record.png',
      height: 20,
      width: 20,
      title: "Record Scene"
    })
    .on('click', function() {
      recordScene();
    });

    playback_bar.append("div")
    .attr("id","prev_scene_div")
    .attr('class','nav_bttn')
    .append('img')
    .attr("id","prev_scene_btn")
    .attr('height', 20)
    .attr('width', 20)
    .attr('src', 'img/prev.png')
    .attr('class','img_btn_disabled')
    .attr('title','Previous Scene')
    .on('click', function() {
      goPreviousScene()
    });

    playback_bar.append("div")
    .attr("id","next_scene_div")
    .attr('class','nav_bttn')
    .append('img')
    .attr('height', 20)
    .attr('width', 20)
    .attr('class','img_btn_disabled')
    .attr("id","next_scene_btn")
    .attr('src', 'img/next.png')
    .attr('title','Next Scene')
    .on('click', function() {
      goNextScene()
    });

    var playback_cb = playback_bar.append("div")
    .attr("id","playback_div")
    .attr('class','nav_bttn')

    var playback_cb_label = playback_cb.append("label")
    .attr("class", "nav_cb");

    playback_cb_label.append("input")
    .attr({
      type: "checkbox",
      name: "playback_cb",
      value: playback_mode
    })
    .property("checked", false)
    .on('change', function() {
      if (!playback_mode) {
        playback_mode = true;

        console.log("playback mode on");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "playback",
          event_detail: "playback mode on"
        }
        usage_log.push(log_event);

        d3.select('#navigation_div').attr('class','control_div onhover')
        d3.select("#caption_div").style("display","none");
        d3.select("#image_div").style("display","none");
        d3.select("#menu_div").style("left",-41 + "px");
        d3.select('#menu_div').attr('class','control_div onhover');
        d3.select("#import_div").style("top",-210 + "px");
        d3.select('#import_div').attr('class','control_div onhover');
        d3.select("#option_div").style("top",-95 + "px");
        d3.select('#option_div').attr('class','control_div onhover')
        d3.select("#filter_div").style("display","none");
        d3.select("#footer").style("bottom",-25 + "px");
        d3.select("#logo_div").style("top",-44 + "px");
      }
      else {
        playback_mode = false;

        console.log("playback mode off");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "playback",
          event_detail: "playback mode off"
        }
        usage_log.push(log_event);

        d3.select('#navigation_div').attr('class','control_div');
        d3.select("#option_div").style("top", 10 + "px");
        d3.select('#option_div').attr('class','control_div');
        d3.select('#import_div').attr('class','control_div');
        d3.select("#menu_div").style("left",10 + "px");
        d3.select('#menu_div').attr('class','control_div')
        d3.select("#footer").style("bottom",0 + "px");
        d3.select("#logo_div").style("top",10 + "px");
      }
    });

    playback_cb_label.append("img")
    .attr({
      id: "play_scene_btn",
      class: 'img_btn_disabled',
      src: 'img/play.png',
      height: 20,
      width: 20,
      title: "Toggle Playback Mode"
    });

    playback_bar.append('div')
    .attr('id','stepper_container')
    .style('width', function () {
      return (window.innerWidth * 0.9 - 120 - 12) + 'px';
    })
    .append('svg')
    .attr('id','stepper_svg')
    .append('text')
    .attr('id','stepper_svg_placeholder')
    .attr('y',25)
    .attr('dy','0.25em')
    .text('Recorded timeline scenes will appear here.');

    window.onresize = function(e) {
      d3.select('#stepper_container').style('width', function () {
        return (window.innerWidth * 0.9 - 120 - 12 - 5) + 'px';
      });
    };

    //drop shadow code from: http://bl.ocks.org/cpbotha/5200394
    var defs = main_svg.append("defs");

    var filter = defs.append("filter")
    .attr("id", "drop-shadow")
    .attr("x",0)
    .attr("y",0)
    .attr("width","200%")
    .attr("height","200%");

    // translate output of Gaussian blur to the right and downwards with 2px
    // store result in offsetBlur
    filter.append("feOffset")
    .attr("in", "SourceAlpha")
    .attr("dx", 2.5)
    .attr("dy", 2.5)
    .attr("result", "offOut");

    filter.append("feGaussianBlur")
    .attr("in","offOut")
    .attr("stdDeviation", 2.5)
    .attr("result","blurOut");

    filter.append("feBlend")
    .attr("in","SourceGraphic")
    .attr("in2", "blurOut")
    .attr("mode","normal");

    var grayscale = defs.append("filter")
    .attr("id","greyscale")
    .append("feColorMatrix")
    .attr("type","matrix")
    .attr("dur","0.5s")
    .attr("values","0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0 0 0 1 0")

    /**
    ---------------------------------------------------------------------------------------
    LOAD DATA
    ---------------------------------------------------------------------------------------
    **/

    var unique_values = d3.map([]);
    var unique_data = [];

    if (source_format == 'demo_json'){
      var data = window[source];

      timeline_json_data = data;

      data.forEach(function (d) {
        unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
      });

      unique_values.forEach(function (d) {
        unique_data.push(unique_values.get(d));
      });
      console.log(unique_data.length + " unique events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "preprocessing",
        event_detail: unique_data.length + " unique events"
      }
      usage_log.push(log_event);

      processTimeline(unique_data);
    }

    else if (source_format == 'json'){
      var data = d3.json(source, function(error, data) {

        timeline_json_data = data;

        data.forEach(function (d) {
          unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
        });

        unique_values.forEach(function (d) {
          unique_data.push(unique_values.get(d));
        });
        console.log(unique_data.length + " unique events");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "preprocessing",
          event_detail: unique_data.length + " unique events"
        }
        usage_log.push(log_event);

        processTimeline(unique_data);
      });
    }

    else if (source_format == 'csv'){
      var data = d3.csv(source, function(error, data) {

        timeline_json_data = data;

        data.forEach(function (d) {
          unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
        });

        //find unique elements
        unique_values.forEach(function (d) {
          unique_data.push(unique_values.get(d));
        });
        console.log(unique_data.length + " unique events");
        processTimeline(unique_data);
      });
    }

    else if (source_format == 'gdoc'){
      var data = timeline_json_data;

      data.forEach(function (d) {
        unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
      });

      //find unique elements
      unique_values.forEach(function (d) {
        unique_data.push(unique_values.get(d));
      });
      console.log(unique_data.length + " unique events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "preprocessing",
        event_detail: unique_data.length + " unique events"
      }
      usage_log.push(log_event);

      processTimeline(unique_data);
    }

    else if (source_format == 'story' || source_format == 'demo_story'){

      playback_mode = true;

      d3.select('#stepper_svg_placeholder').remove();

      if (source_format == 'story') {
        var story = d3.json(source, function(error, story) {

          timeline_json_data = story.timeline_json_data;

          scenes = story.scenes;
          caption_list = story.caption_list;
          image_list = story.image_list;
          annotation_list = story.annotation_list;
          caption_index = story.caption_list.length - 1;
          image_index = story.image_list.length - 1;

          scenes.forEach(function (d,i){
            if (d.s_order == undefined) {
              d.s_order = i;
            }
          })

          story.timeline_json_data.forEach(function (d) {
            unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
          });

          unique_values.forEach(function (d) {
            unique_data.push(unique_values.get(d));
          });
          console.log(unique_data.length + " unique events");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "preprocessing",
            event_detail: unique_data.length + " unique events"
          }
          usage_log.push(log_event);

          updateNavigationStepper();
          processTimeline(unique_data);
        });
      }
      else if (source_format == 'demo_story') {

        var story = window[source];

        timeline_json_data = story.timeline_json_data;

        scenes = story.scenes;
        caption_list = story.caption_list;
        image_list = story.image_list;
        annotation_list = story.annotation_list;
        caption_index = story.caption_list.length - 1;
        image_index = story.image_list.length - 1;

        scenes.forEach(function (d,i){
          if (d.s_order == undefined) {
            d.s_order = i;
          }
        })

        story.timeline_json_data.forEach(function (d) {
          unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
        });

        unique_values.forEach(function (d) {
          unique_data.push(unique_values.get(d));
        });
        console.log(unique_data.length + " unique events");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "preprocessing",
          event_detail: unique_data.length + " unique events"
        }
        usage_log.push(log_event);

        updateNavigationStepper();
        processTimeline(unique_data);
      }
    }
  }

  function processTimeline (data) {

    //check for earliest and latest numerical dates before parsing
    earliest_date = d3.min(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date
      }
      else {
        return +d.start_date;
      }
    });

    latest_start_date = d3.max(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date
      }
      else {
        return +d.start_date;
      }
    });

    latest_end_date = d3.max(data, function (d) {
      if (d.end_date instanceof Date) {
        return d.end_date
      }
      else {
        return +d.end_date;
      }
    });

    //set flag for really epic time scales
    if (isNumber(earliest_date)) {
      if (earliest_date < -9999 || d3.max([latest_start_date,latest_end_date]) > 10000) {
        date_granularity = "epochs";
      }
    }

    console.log("date_granularity after: " + date_granularity)

    parseDates(data); //parse all the date values, replace blank end_date values

    //set annotation counter for each item
    data.forEach(function (item) {
      item.annotation_count = 0;
    });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS CATEGORIES OF EVENTS
    ---------------------------------------------------------------------------------------
    **/

    //determine event categories from data
    categories.domain(data.map(function (d) {
      return d.category;
    }));

    num_categories = categories.domain().length;

    max_legend_item_width = 0;

    categories.domain().sort().forEach(function (item) {

      var legend_dummy = document.createElement('span');
      legend_dummy.id = 'legend_dummy';
      legend_dummy.style.fontSize = '12px';
      legend_dummy.style.fill = '#fff';
      legend_dummy.style.fontFamily = 'Century Gothic';
      legend_dummy.innerHTML = item;
      document.body.appendChild(legend_dummy);
      var legend_dummy_width = legend_dummy.offsetWidth;
      document.body.removeChild(legend_dummy);

      if (legend_dummy_width > max_legend_item_width) {
        max_legend_item_width = legend_dummy_width;
      }
    })

    console.log("# categories: " + num_categories);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "# categories: " + num_categories
    }
    usage_log.push(log_event);

    //assign colour labels to categories if # categories < 12
    if (num_categories <= 20 && num_categories >= 11) {
      categories.range(colorSchemes.schema5);
    }
    else if (num_categories <= 10 && num_categories >= 3) {
      categories.range(colorSchemes.schema2);
    }
    else if (num_categories == 2) {
      categories.range(["#E45641","#44B3C2"]);
    }
    else {
      // categories.range(["#000"]); // black used in Priestley style
      categories.range(["#E45641"]);
    }

    filter_div.append('input')
    .attr({
      type: "image",
      name: "Hide filter panel",
      id: "export_close_btn",
      class: 'img_btn_enabled',
      src: 'img/close.png',
      height: 15,
      width: 15,
      title: "Hide filter panel"
    })
    .style('position','absolute')
    .style('top','0px')
    .style('left','5px')
    .style('margin-top','5px')
    .on('click', function() {
      d3.select("#filter_div").style("display","none");

      console.log("hide filter panel");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "export",
        event_detail: "hide filter panel"
      }
      usage_log.push(log_event);
    });

    filter_div.append("text")
    .attr("class","menu_label filter_label")
    .style("margin-right","auto")
    .text("Filter by:");

    filter_div.append("hr")
    .attr("class","menu_hr");

    var category_filter = filter_div.append("div")
    .attr('class','filter_div_section');

    var category_filter_header = category_filter.append("div")
    .attr('class','filter_div_header');

    category_filter_header.append("text")
    .attr("class","menu_label filter_label")
    .text("Category");

    category_filter_header.append("label")
    .attr("for","category_picker")
    .style("display","block")
    .style("margin-right","100%")
    .attr("id","category_picker_label")
    .append("img")
    .attr({
      name: "Filter by event category",
      class: "filter_header_icon",
      height: 30,
      width: 30,
      title: "Filter by event category",
      src: "img/categories.png"
    });

    var all_categories = ["( All )"];

    var category_picker = category_filter.append("select")
    .attr("class","filter_select")
    .attr("size",8)
    .attr("id","category_picker")
    .attr({
      multiple: true
    })
    .on("change", function () {
      selected_categories = d3.select(this)
      .selectAll("option")
      .filter(function (d, i) {
        return this.selected;
      });
      if (filter_type == "Hide") {
        dispatch.remove(selected_categories, selected_facets, selected_segments);
      }
      else if (filter_type == "Highlight") {
        dispatch.highlight(selected_categories, selected_facets, selected_segments);
      }
    })
    .selectAll("option")
    .data(all_categories.concat(categories.domain().sort()))
    .enter()
    .append("option")
    .text(function(d) { return d; })
    .property("selected", function (d, i) {
      return d == "( All )";
    });

    selected_categories = d3.select("#category_picker")
    .selectAll("option")
    .filter(function (d, i) {
      return this.selected;
    });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS FACETS
    ---------------------------------------------------------------------------------------
    **/

    //determine facets (separate timelines) from data
    facets.domain(data.map(function (d) {
      return d.facet;
    }));

    facets.domain().sort();

    num_facets = facets.domain().length;
    total_num_facets = num_facets;
    num_facet_cols = Math.ceil(Math.sqrt(num_facets));
    num_facet_rows = Math.ceil(num_facets / num_facet_cols);

    console.log("# facets: " + num_facets);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "# facets: " + num_facets
    }
    usage_log.push(log_event);

    var facet_filter = filter_div.append("div")
    .attr('class','filter_div_section');

    var facet_filter_header = facet_filter.append("div")
    .attr('class','filter_div_header');

    facet_filter_header.append("text")
    .attr("class","menu_label filter_label")
    .text("Facet");

    facet_filter_header.append("label")
    .attr("for","facet_picker")
    .style("display","block")
    .style("margin-right","100%")
    .attr("id","facet_picker_label")
    .append("img")
    .attr({
      name: "Filter by event facet",
      class: "filter_header_icon",
      height: 30,
      width: 30,
      title: "Filter by event facet",
      src: "img/facets.png"
    });

    var all_facets = ["( All )"];

    var facet_picker = facet_filter.append("select")
    .attr("class","filter_select")
    .attr("size",7)
    .attr("id","facet_picker")
    .attr({
      multiple: true
    })
    .on("change", function () {
      selected_facets = d3.select(this)
      .selectAll("option")
      .filter(function (d, i) {
        return this.selected;
      })
      if (filter_type == "Hide") {
        dispatch.remove(selected_categories, selected_facets, selected_segments);
      }
      else if (filter_type == "Highlight") {
        dispatch.highlight(selected_categories, selected_facets, selected_segments);
      }
    })
    .selectAll("option")
    .data(all_facets.concat(facets.domain().sort()))
    .enter()
    .append("option")
    .text(function(d) { return d; })
    .property("selected", function (d, i) {
      return d == "( All )";
    });;

    selected_facets = d3.select("#facet_picker")
    .selectAll("option")
    .filter(function (d, i) {
      return this.selected;
    });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS SEGMENTS
    ---------------------------------------------------------------------------------------
    **/

    //event sorting function
    data.sort(compareAscending);

    if (date_granularity == "epochs"){
      data.min_start_date = earliest_date;
      data.max_start_date = d3.max([latest_start_date,latest_end_date]);
      data.max_end_date = d3.max([latest_start_date,latest_end_date]);
    }
    else {
      //determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    //determine the granularity of segments
    segment_granularity = getSegmentGranularity(data.min_start_date,data.max_end_date);

    data.forEach(function (item) {
      item.segment = getSegment(item.start_date);
    });

    //determine facets (separate timelines) from data
    present_segments.domain(data.map(function (d) {
      return d.segment;
    }));

    console.log("# segments: " + present_segments.domain().length);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "# segments: " + present_segments.domain().length
    }
    usage_log.push(log_event);

    var segment_filter = filter_div.append("div")
    .attr('class','filter_div_section');

    var segment_filter_header = segment_filter.append("div")
    .attr('class','filter_div_header');

    segment_filter_header.append("text")
    .attr("class","menu_label filter_label")
    .text("Segment");

    segment_filter_header.append("label")
    .attr("for","segment_picker")
    .style("display","block")
    .style("margin-right","100%")
    .attr("id","segment_picker_label")
    .append("img")
    .attr({
      name: "Filter by chronological segment",
      class: "filter_header_icon",
      height: 30,
      width: 30,
      title: "Filter by chronological segment",
      src: "img/segments.png"
    });

    var all_segments = ["( All )"];

    var segment_picker = segment_filter.append("select")
    .attr("id","segment_picker")
    .attr("class","filter_select")
    .attr("size",7)
    .attr({
      multiple: true
    })
    .on("change", function () {
      selected_segments = d3.select(this)
      .selectAll("option")
      .filter(function (d, i) {
        return this.selected;
      })
      if (filter_type == "Hide") {
        dispatch.remove(selected_categories, selected_facets, selected_segments);
      }
      else if (filter_type == "Highlight") {
        dispatch.highlight(selected_categories, selected_facets, selected_segments);
      }
    })
    .selectAll("option")
    .data(all_segments.concat(present_segments.domain().sort()))
    .enter()
    .append("option")
    .text(function(d) { return d; })
    .property("selected", function (d, i) {
      return d == "( All )";
    });

    selected_segments = d3.select("#segment_picker")
    .selectAll("option")
    .filter(function (d, i) {
      return this.selected;
    });

    all_data = data;
    active_data = all_data;

    measureTimeline (active_data);

    if (source_format == "story" || source_format == "demo_story") {
      d3.select('#navigation_div').attr('class','control_div onhover')
      d3.select("#caption_div").style("display","none");
      d3.select("#image_div").style("display","none");
      d3.select("#menu_div").style("left",-41 + "px");
      d3.select('#menu_div').attr('class','control_div onhover');
      d3.select('#import_div').attr('class','control_div onhover');
      d3.select("#option_div").style("top",-95 + "px");
      d3.select('#option_div').attr('class','control_div onhover')
      d3.select("#filter_div").style("display","none");
      d3.select("#footer").style("bottom",-25 + "px");
      d3.select("#logo_div").style("top",-44 + "px");
      drawTimeline (active_data);
    }
    else {
      d3.select('#timeline_metadata_contents')
      .html(
        "<span class='metadata_title'>About this data:</span>" +
        "<p class='metadata_content'><strong>Cardinality & extent</strong>: " +
        active_data.length + " unique events spanning " + range_text + " (Granularity: " + segment_granularity + ")</p>" +
        "<p class='metadata_content'><strong>Event categories</strong>: ( " + num_categories + " ) .. " + categories.domain().join(" .. ") + "</p>" +
        "<p class='metadata_content'><strong>Timeline facets</strong>: ( " + num_facets + " ) .. " + facets.domain().join(" .. ") + "</p>"
      );

      timeline_metadata.style("display","inline");
    }

  }

    /**
    ---------------------------------------------------------------------------------------
    SELECT SCALE
    ---------------------------------------------------------------------------------------
    **/

  d3.selectAll("#scale_picker input[name=scale_rb]").on("change", function() {

    console.log("scale change: " + this.value);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "scale_change",
      event_detail: "scale change: " + this.value
    }
    usage_log.push(log_event);

    determineSize(active_data,this.value,timeline_vis.tl_layout(),timeline_vis.tl_representation());

    main_svg.transition()
    .duration(1200)
    .attr("width", d3.max([width, window.innerWidth - margin.right - margin.left - getScrollbarWidth()]))
    .attr("height", d3.max([height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

    main_svg.call(timeline_vis.duration(1200)
    .tl_scale(this.value)
    .height(height)
    .width(width));

    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT LAYOUT
  ---------------------------------------------------------------------------------------
  **/

  d3.selectAll("#layout_picker input[name=layout_rb]").on("change", function() {

    console.log("layout change: " + this.value);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "layout_change",
      event_detail: "layout change: " + this.value
    }
    usage_log.push(log_event);

    determineSize(active_data,timeline_vis.tl_scale(),this.value,timeline_vis.tl_representation());

    main_svg.transition()
    .duration(1200)
    .attr("width", d3.max([width, window.innerWidth - margin.right - margin.left - getScrollbarWidth()]))
    .attr("height", d3.max([height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

    main_svg.call(timeline_vis.duration(1200)
    .tl_layout(this.value)
    .height(height)
    .width(width));

    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT REPRESENTATION
  ---------------------------------------------------------------------------------------
  **/

  d3.selectAll("#representation_picker input[name=representation_rb]").on("change", function() {

    console.log("representation change: " + this.value);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "representation_change",
      event_detail: "representation change: " + this.value
    }
    usage_log.push(log_event);

    if (timeline_vis.tl_layout() == "Segmented") {
      if (this.value == "Grid"){
        d3.selectAll(".timeline_event_g").remove();
        segment_granularity = "centuries";
      }
      else if (this.value == "Calendar") {
        d3.selectAll(".timeline_event_g").remove();
        segment_granularity = "weeks";
      }
      else {
        segment_granularity = getSegmentGranularity(active_data.min_start_date,active_data.max_end_date);
        if (timeline_vis.previous_segment_granularity() != segment_granularity) {
          d3.selectAll(".timeline_event_g").remove();
        }
      }
    }

    determineSize(active_data,timeline_vis.tl_scale(),timeline_vis.tl_layout(),this.value);

    main_svg.transition()
    .duration(1200)
    .attr("width", d3.max([width, window.innerWidth - margin.right - margin.left - getScrollbarWidth()]))
    .attr("height", d3.max([height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

    main_svg.call(timeline_vis.duration(1200)
    .tl_representation(this.value)
    .height(height)
    .width(width));

    if (timeline_vis.tl_representation() == "Curve" && !dirty_curve) {
      d3.select('.timeline_frame').style("cursor","crosshair");
    }
    else {
      d3.select('.timeline_frame').style("cursor","auto");
    }

    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SCENE transitions
  ---------------------------------------------------------------------------------------
  **/

  function recordScene () {

    d3.select('#stepper_svg_placeholder').remove();

    record_width = width;
    record_height = height;

    console.log("scene " + (current_scene_index + 2) + " recorded: " + timeline_vis.tl_representation() + " / " + timeline_vis.tl_scale() + " / " + timeline_vis.tl_layout());

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "record",
      event_detail: "scene " + (current_scene_index + 2) + " recorded: " + timeline_vis.tl_representation() + " / " + timeline_vis.tl_scale() + " / " + timeline_vis.tl_layout()
    }
    usage_log.push(log_event);

    var scene_captions = [];
    var scene_images = [];
    var scene_annotations = [];
    var scene_selections = [];

    main_svg.selectAll(".timeline_caption")[0].forEach( function (caption) {
      var scene_caption = {
        caption_id: caption.id
      };
      scene_captions.push(scene_caption);
    });

    main_svg.selectAll(".timeline_image")[0].forEach( function (image) {
      var scene_image = {
        image_id: image.id
      };
      scene_images.push(scene_image);
    });

    main_svg.selectAll(".event_annotation")[0].forEach( function (annotation) {
      var scene_annotation = {
        annotation_id: annotation.id
      };
      scene_annotations.push(scene_annotation);
    });

    main_svg.selectAll(".timeline_event_g")[0].forEach( function (event) {
      if (event.__data__.selected == true) {
        scene_selections.push(event.__data__.event_id)
      }
    });

    //weird gif resizing bug
    // if (width > gif.options.width)
    //   gif.setOptions({width: width})
    // if (height > gif.options.height)
    //   gif.setOptions({height: height})

    var scene = {
      s_width: width,
      s_height: height,
      s_scale: timeline_vis.tl_scale(),
      s_layout: timeline_vis.tl_layout(),
      s_representation: timeline_vis.tl_representation(),
      s_categories: selected_categories,
      s_facets: selected_facets,
      s_segments: selected_segments,
      s_filter_type: filter_type,
      s_legend_x: legend_x,
      s_legend_y: legend_y,
      s_legend_expanded: legend_expanded,
      s_captions: scene_captions,
      s_images: scene_images,
      s_annotations: scene_annotations,
      s_selections: scene_selections,
      s_timecurve: d3.select('#timecurve').attr('d'),
      s_order: current_scene_index + 1
    };
    scenes.push(scene);
    current_scene_index++;

    svgAsPNG(document.getElementById("main_svg"), gif_index, {backgroundColor: "white"});

    for (var i = 0; i < scenes.length - 1; i ++){
      if (scenes[i].s_order >= scenes[scenes.length - 1].s_order) {
        scenes[i].s_order++;
      }
    }

    var checkExist = setInterval(function() {
       if (document.getElementById('gif_frame' + gif_index) != null) {
          console.log('gif_frame' + gif_index + " Exists!");
          scenes[scenes.length - 1].s_src = document.getElementById('gif_frame' + gif_index).src;
          document.getElementById('gif_frame' + gif_index).remove();
          gif_index++;
          updateNavigationStepper();
          clearInterval(checkExist);
       }
    }, 100); // check every 100ms

    return true;
  };

  function updateNavigationStepper(){

    var STEPPER_STEP_WIDTH = 50;

    var navigation_step_svg = d3.select('#stepper_svg');

    var navigation_step = navigation_step_svg.selectAll('.framePoint')
    .data(scenes);

    var navigation_step_exit = navigation_step.exit().transition()
    .duration(1000)
    .remove();

    var navigation_step_update = navigation_step.transition()
    .duration(1000);

    var navigation_step_enter = navigation_step.enter()
    .append('g')
    .attr('class', 'framePoint')
    .attr('id', function(d,i){
      return 'frame' + d.s_order;
    })
    .style('cursor','pointer')
    .on('click', function (d,i) {
      current_scene_index = +d3.select(this).attr('id').substr(5);
      changeScene(current_scene_index);
    });

    navigation_step_update.attr('id', function(d,i){
      return 'frame' + d.s_order;
    });

    navigation_step_enter.append('title')
    .text(function (d,i) {
      return 'Scene ' + (d.s_order + 1);
    });

    navigation_step_update.select("title")
    .text(function (d,i) {
      return 'Scene ' + (d.s_order + 1);
    });

    navigation_step_enter.append('rect')
    .attr('fill', 'white')
    .attr('x', function(d,i){
      return d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5;
    })
    .attr('y', 0)
    .attr('width', STEPPER_STEP_WIDTH)
    .attr('height', STEPPER_STEP_WIDTH)
    .style('stroke', function (d,i){
      if (d.s_order == current_scene_index) {
        return '#666';
      }
      else {
        return '#999';
      }
    })
    .style('stroke-width', function(d,i){
      if (d.s_order == current_scene_index) {
        return '3px';
      }
      else {
        return '1px';
      }
    });

    navigation_step_update.select("rect")
    .attr('x', function(d,i){
      return d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5;
    })
    .style('stroke', function (d,i){
      if (d.s_order == current_scene_index) {
        return '#666';
      }
      else {
        return '#999';
      }
    })
    .style('stroke-width', function(d,i){
      if (d.s_order == current_scene_index) {
        return '3px';
      }
      else {
        return '1px';
      }
    });

    navigation_step_enter.append('svg:image')
    .attr("xlink:href", function(d,i) {
      return d.s_src;
    })
    .attr('x', function(d,i){
      return d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5 + 2;
    })
    .attr('y', 2)
    .attr('width', STEPPER_STEP_WIDTH - 4)
    .attr('height', STEPPER_STEP_WIDTH - 4);

    navigation_step_update.select("image")
    .attr('x', function(d,i){
      return d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5 + 2;
    })

    navigation_step_svg.selectAll('.framePoint')
    .on('mouseover', function (d,i) {

      var x_pos = d3.min([+d3.select(this).select('rect').attr('x') + 100,window.innerWidth - margin.right - margin.left - getScrollbarWidth() - 300]);

      var img_src = d3.select(this).select('image').attr('href');

      if (d.s_order == current_scene_index) {
        d3.select(this).select('rect')
        .style('stroke-width', '3px')
        .style("stroke", function(){
          return '#666';
        })
      }
      else {
        d3.select(this).select('rect')
        .style('stroke-width', '3px')
        .style("stroke", function(){
          return '#f00';
        })
      }

      var frame_hover = d3.select("body").append('div')
      .attr('class','frame_hover')
      .style('left', x_pos + 'px')
      .style('top', (window.innerHeight - margin.bottom - 300 + window.scrollY) + 'px')
      .append('svg')
      .style('padding','0px')
      .style('width','300px')
      .style('height','300px')
      .append('svg:image')
      .attr("xlink:href", img_src)
      .attr('x', 2)
      .attr('y', 2)
      .attr('width', 296)
      .attr('height', 296);

    })
    .on('mouseout', function (d,i) {

      if (d.s_order == current_scene_index) {
        d3.select(this).select('rect')
        .style('stroke-width', '3px')
        .style("stroke", function(){
          return '#666';
        })
      }
      else {
        d3.select(this).select('rect')
        .style('stroke-width', '1px')
        .style("stroke", function(){
          return '#999';
        })
      }

      d3.selectAll(".frame_hover").remove();

    });

    navigation_step_svg.attr('width', (scenes.length+1) * (STEPPER_STEP_WIDTH + 5));
  }

  function changeScene (scene_index) {

    updateNavigationStepper()

    var scene_found = false,
    i = 0,
    scene = scenes[0];

    while (!scene_found) {
      if (scenes[i].s_order == scene_index){
        scene_found = true;
        scene = scenes[i];
      }
      i++;
    }

    d3.select('#timecurve').style('visibility', 'hidden');

    if (scene.s_representation == "Curve") {
      d3.select('#timecurve').attr('d',scenes[scene_index].s_timecurve);
      timeline_vis.render_path(scenes[scene_index].s_timecurve);
      timeline_vis.reproduceCurve();
    }

    //is the new scene a segmented grid or calendar? if so, re-segment the events
    if (scene.s_layout == "Segmented") {
      if (scene.s_representation == "Grid"){
        d3.selectAll(".timeline_event_g").remove();
        segment_granularity = "centuries";
      }
      else if (scene.s_representation == "Calendar") {
        d3.selectAll(".timeline_event_g").remove();
        segment_granularity = "weeks";
      }
      else {
        segment_granularity = getSegmentGranularity(active_data.min_start_date,active_data.max_end_date);
        if (timeline_vis.previous_segment_granularity() != segment_granularity) {
          d3.selectAll(".timeline_event_g").remove();
        }
      }
    }

    var scene_delay = 0;

    //set a delay for annotations and captions based on whether the scale, layout, or representation changes
    if (timeline_vis.tl_scale() != scene.s_scale || timeline_vis.tl_layout() != scene.s_layout || timeline_vis.tl_representation() != scene.s_representation) {
      scene_delay = 1200 * 4;

      //how big is the new scene?
      determineSize(active_data,scene.s_scale,scene.s_layout,scene.s_representation);

      //resize the main svg to accommodate the scene
      main_svg.transition()
      .duration(1200)
      .attr("width", d3.max([width, scene.s_width, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]))
      .attr("height", d3.max([height, scene.s_height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

      //set the scene's scale, layout, representation
      timeline_vis.tl_scale(scene.s_scale)
      .tl_layout(scene.s_layout)
      .tl_representation(scene.s_representation)
      .height(d3.max([height, scene.s_height]))
      .width(d3.max([width, scene.s_width]));
    }

    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());

    //initilaize scene filter settings
    var scene_category_values = [],
    scene_facet_values = [],
    scene_segment_values = [];

    //which categories are shown in the scene?
    scene.s_categories[0].forEach( function (item) {
      scene_category_values.push(item.__data__);
    });

    //update the category picker
    d3.select("#category_picker")
    .selectAll("option")
    .property("selected", function (d, i){
      return scene_category_values.indexOf(d) != -1;
    });

    //which facets are shown in the scene?
    scene.s_facets[0].forEach( function (item) {
      scene_facet_values.push(item.__data__);
    });

    //update the facet picker
    d3.select("#facet_picker")
    .selectAll("option")
    .property("selected", function (d, i){
      return scene_facet_values.indexOf(d) != -1;
    });

    //which segments are shown in the scene?
    scene.s_segments[0].forEach( function (item) {
      scene_segment_values.push(item.__data__);
    });

    //update the segment picker
    d3.select("#segment_picker")
    .selectAll("option")
    .property("selected", function (d, i){
      return scene_segment_values.indexOf(d) != -1;
    });

    //if filters change in "remove" mode, delay annoations and captions until after transition
    var scene_filter_set_length = scene_category_values.length + scene_facet_values.length + scene_segment_values.length;

    if (scene.s_filter_type == "Hide") {
      scene_filter_set_length += 1;
    }

    if (scene_filter_set_length != filter_set_length) {
      filter_set_length = scene_filter_set_length;
      scene_delay = 1200 * 4;
    }

    //what type of filtering is used in the scene?
    if (scene.s_filter_type == "Hide") {
      d3.selectAll("#filter_type_picker input[name=filter_type_rb]")
      .property("checked", function (d, i){
        return d == "Hide";
      });
      if (filter_type == "Highlight") {
        dispatch.highlight(d3.select("#category_picker").select("option"), d3.select("#facet_picker").select("option"), d3.select("#segment_picker").select("option"));
      }
      filter_type = "Hide";
      dispatch.remove(scene.s_categories, scene.s_facets, scene.s_segments);
    }
    else if (scene.s_filter_type == "Highlight") {
      d3.selectAll("#filter_type_picker input[name=filter_type_rb]")
      .property("checked", function (d, i){
        return d == "Highlight";
      });
      if (filter_type == "Hide") {
        active_data = all_data;
        dispatch.remove(d3.select("#category_picker").select("option"), d3.select("#facet_picker").select("option"), d3.select("#segment_picker").select("option"));
      }
      filter_type = "Highlight";
      dispatch.highlight(scene.s_categories, scene.s_facets, scene.s_segments);
    }

    //where is the legend in the scene?
    d3.select(".legend")
    .transition()
    .duration(1200)
    .style("z-index", 1)
    .attr("x", scene.s_legend_x)
    .attr("y", scene.s_legend_y);

    legend_x = scene.s_legend_x;
    legend_y = scene.s_legend_y;

    main_svg.selectAll(".timeline_caption").remove();

    main_svg.selectAll(".timeline_image").remove();

    main_svg.selectAll(".event_annotation").remove();

    d3.selectAll('.timeline_event_g').each(function () {
      this.__data__.selected = false;
    });

    d3.selectAll(".event_span")
    .attr("filter", "none")
    .style("stroke","#fff")
    .style("stroke-width","0.25px");

    d3.selectAll(".event_span_component")
    .style("stroke","#fff")
    .style("stroke-width","0.25px");

    //delay the appearance of captions and annotations if the scale, layout, or representation changes relative to the previous scene
    setTimeout(function () {

      //is the legend expanded in this scene?
      if (scene.s_legend_expanded) {
        legend_expanded = true;
        expandLegend();
      }
      else {
        legend_expanded = false;
        collapseLegend();
      }

      //restore captions that are in the scene
      caption_list.forEach( function (caption) {
        var i = 0;
        while (i < scene.s_captions.length && scene.s_captions[i].caption_id != caption.id) {
          i++;
        }
        if (i < scene.s_captions.length) {
          // caption is in the scene
          addCaption(caption.caption_text,caption.caption_width,caption.x_rel_pos,caption.y_rel_pos,caption.c_index);
        }
      });

      //restore images that are in the scene
      image_list.forEach( function (image) {
        var i = 0;
        while (i < scene.s_images.length && scene.s_images[i].image_id != image.id) {
          i++;
        }
        if (i < scene.s_images.length) {
          // image is in the scene
          addImage(image.i_url,image.x_rel_pos,image.y_rel_pos,image.i_width,image.i_height,image.i_index);
        }
      });

      //restore annotations that are in the scene
      annotation_list.forEach( function (annotation) {
        var i = 0;
        while (i < scene.s_annotations.length && scene.s_annotations[i].annotation_id != annotation.id) {
          i++;
        }
        if (i < scene.s_annotations.length) {
          // annotation is in the scene

          var item = d3.select("#event_g" + annotation.item_index).select("rect.event_span")[0][0].__data__,
              item_x_pos = 0,
              item_y_pos = 0;

          if (scene.s_representation != "Radial") {
            item_x_pos = item.rect_x_pos + item.rect_offset_x + padding.left + unit_width * 0.5;
            item_y_pos = item.rect_y_pos + item.rect_offset_y + padding.top + unit_width * 0.5;
          }
          else {
            item_x_pos = item.path_x_pos + item.path_offset_x + padding.left;
            item_y_pos = item.path_y_pos + item.path_offset_y + padding.top;
          }

          annotateEvent(annotation.content_text,item_x_pos,item_y_pos,annotation.x_offset,annotation.y_offset,annotation.x_anno_offset,annotation.y_anno_offset,annotation.label_width,annotation.item_index,annotation.count);
        }
      });

      //toggle selected events in the scene
      main_svg.selectAll(".timeline_event_g")[0].forEach( function (event) {
        if (scene.s_selections.indexOf(event.__data__.event_id) != -1) {
          event.__data__.selected = true;
          d3.select("#event_g" + event.__data__.event_id)
          .selectAll(".event_span")
          .attr("filter", "url(#drop-shadow)")
          .style("z-index",1)
          .style("stroke","#f00")
          .style("stroke-width","1.25px");
          d3.select("#event_g" + event.__data__.event_id)
          .selectAll(".event_span_component")
          .style("z-index",1)
          .style("stroke","#f00")
          .style("stroke-width","1px");
        }
        else {
          event.__data__.selected = false;
          d3.select("#event_g" + event.__data__.event_id)
          .selectAll(".event_span")
          .attr("filter", "none")
          .style("stroke","#fff")
          .style("stroke-width","0.25px");
          d3.select("#event_g" + event.__data__.event_id)
          .selectAll(".event_span_component")
          .style("stroke","#fff")
          .style("stroke-width","0.25px");
        }
      });

      if (timeline_vis.tl_representation() != 'Curve') {
        d3.select('#timecurve').style('visibility', 'hidden');
      }
      else {
        d3.select('#timecurve').style('visibility', 'visible');
      }

      main_svg.style('visibility','visible');

    },scene_delay);

  };

  function measureTimeline (data) {

    /**
    ---------------------------------------------------------------------------------------
    SORT AND NEST THE EVENTS
    ---------------------------------------------------------------------------------------
    **/

    //event sorting function
    data.sort(compareAscending);

    if (date_granularity == "epochs"){
      data.min_start_date = earliest_date;
      data.max_start_date = d3.max([latest_start_date,latest_end_date]);
      data.max_end_date = d3.max([latest_start_date,latest_end_date]);
    }
    else {
      //determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    if (date_granularity == "epochs") {
      var format = function(d) {
        return formatAbbreviation(d);
      }
      range_text = format(data.max_end_date.valueOf() - data.min_start_date.valueOf()) + " years" +
      ": " + data.min_start_date.valueOf() + " - " + data.max_end_date.valueOf();

      console.log("range: " + range_text);

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "preprocessing",
        event_detail: "range: " + range_text
      }
      usage_log.push(log_event);

    }
    else {
      range_text = moment(data.min_start_date).from(moment(data.max_end_date),true) +
      ": " + moment(data.min_start_date).format('YYYY-MM-DD') + " - " + moment(data.max_end_date).format('YYYY-MM-DD');
      console.log("range: " + range_text);

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "preprocessing",
        event_detail: "range: " + range_text
      }
      usage_log.push(log_event);
    }

    //create a nested data structure to contain faceted data
    timeline_facets = d3.nest()
    .key(function (d) {
      return d.facet;
    })
    .sortKeys(d3.ascending)
    .entries(data);

    //get event durations
    data.forEach(function (item) {
      if (date_granularity == "days") {
        item.duration = d3.time.days(item.start_date, item.end_date).length;
      }
      else if (date_granularity == "years") {
        item.duration = item.end_date.getUTCFullYear() - item.start_date.getUTCFullYear();
      }
      else if (date_granularity == "epochs") {
        item.duration = item.end_date.valueOf() - item.start_date.valueOf();
      }
    });

    data.max_duration = d3.max(data, function (d) {
      return d.duration;
    });

    data.min_duration = d3.min(data, function (d) {
      return d.duration;
    });

    console.log("max event duration: " + data.max_duration + " " + date_granularity);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "max event duration: " + data.max_duration + " " + date_granularity
    }
    usage_log.push(log_event);

    console.log("min event duration: " + data.min_duration + " " + date_granularity);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "min event duration: " + data.min_duration + " " + date_granularity
    }
    usage_log.push(log_event);

    //determine the granularity of segments
    segment_granularity = getSegmentGranularity(data.min_start_date,data.max_end_date);

    console.log("segment granularity: " + segment_granularity);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "preprocessing",
      event_detail: "segment granularity: " + segment_granularity
    }
    usage_log.push(log_event);

    switch (segment_granularity) {
      case "days":
      timeline_segments = time.day.range(time.day.floor(data.min_start_date),time.day.ceil(data.max_end_date));
      break;
      case "weeks":
      timeline_segments = time.week.range(time.week.floor(data.min_start_date),time.week.ceil(data.max_end_date));
      break;
      case "months":
      timeline_segments = time.month.range(time.month.floor(data.min_start_date),time.month.ceil(data.max_end_date));
      break;
      case "years":
      timeline_segments = time.year.range(time.utcYear.floor(data.min_start_date),time.utcYear.ceil(data.max_end_date));
      break;
      case "decades":
      var start = Math.floor(data.min_start_date.getUTCFullYear() / 10) * 10;
      if (data.max_end_date.getUTCFullYear() % 10 == 0) {
        var end = Math.ceil(data.max_end_date.getUTCFullYear() / 10 + 1) * 10;
      }
      else {
        var end = Math.ceil(data.max_end_date.getUTCFullYear() / 10) * 10;
      }
      timeline_segments = d3.range(start,end,10);
      break;
      case "centuries":
      var start = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100;
      var end = Math.ceil(data.max_end_date.getUTCFullYear() / 100) * 100;
      timeline_segments = d3.range(start,end,100);
      break;
      case "millenia":
      var start = Math.floor(data.min_start_date.getUTCFullYear() / 1000) * 1000;
      var end = Math.ceil(data.max_end_date.getUTCFullYear() / 1000) * 1000;
      timeline_segments = d3.range(start,end,1000);
      break;
      case "epochs":
      timeline_segments = [data.min_start_date.valueOf()];
      break
      default:
      timeline_segments = [];
      break;
    }

    segments.domain(timeline_segments);

    num_segments = timeline_segments.length;
    num_segment_cols = Math.ceil(Math.sqrt(num_segments));
    num_segment_rows = Math.ceil(num_segments / num_segment_cols);

  };

  function drawTimeline (data) {

    /**
    ---------------------------------------------------------------------------------------
    CALL STANDALONE TIMELINE VISUALIZATIONS
    ---------------------------------------------------------------------------------------
    **/

    control_panel.selectAll("input").attr("class","img_btn_enabled");
    d3.select("#navigation_div").style("bottom", 30 + "px");
    d3.select("#filter_type_picker").selectAll("input").property("disabled",false);
    d3.select("#filter_type_picker").selectAll("img").attr("class","img_btn_enabled");
    d3.select('#playback_bar').selectAll('img').attr('class','img_btn_enabled');

    if (source_format == 'story' || source_format == 'demo_story'){
      timeline_vis.tl_scale(scenes[0].s_scale)
      .tl_layout(scenes[0].s_layout)
      .tl_representation(scenes[0].s_representation);
    }
    else {
      d3.select("#menu_div").style("left",10 + "px");
    }

    updateRadioBttns(timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());

    determineSize(data,timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());

    main_svg.transition()
    .duration(1200)
    .attr("width", d3.max([width, window.innerWidth - margin.right - margin.left - getScrollbarWidth()]))
    .attr("height", d3.max([height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

    timeline_vis.previous_segment_granularity(segment_granularity);

    global_min_start_date = data.min_start_date;
    global_max_end_date = data.max_end_date;

    main_svg.datum(data)
    .call(timeline_vis.duration(1200).height(height).width(width));

    if (source_format == 'story' || source_format == 'demo_story') {

      current_scene_index = 0;
      changeScene(0);
    }

    if (num_categories <= 12 && num_categories > 1) {

      //setup legend
      legend_panel = main_svg.append('svg')
      .attr('height', 35 + track_height * (num_categories + 1) + 5)
      .attr('width', max_legend_item_width + 10 + unit_width + 10)
      .attr('class','legend')
      .on("mouseover", function () {
        d3.select(this).select('.legend_rect').attr("filter", "url(#drop-shadow)")
      })
      .on("mouseout", function () {
        d3.select(this).select('.legend_rect').attr("filter", "none")
      })
      .on("dblclick", function () {

        if (legend_expanded) {

          console.log("legend minimized");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "legend",
            event_detail: "legend minimized"
          }
          usage_log.push(log_event);

          legend_expanded = false;
          collapseLegend();
        }
        else {

          console.log("legend expanded");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "legend",
            event_detail: "legend expanded"
          }
          usage_log.push(log_event);

          legend_expanded = true;
          expandLegend();
        }
      })
      .call(legendDrag);

      legend_panel.append("title")
      .text("Double click to hide legend.")

      legend_panel.append("rect")
      .attr('class','legend_rect')
      .attr('height',track_height * (num_categories + 1))
      .attr('width', max_legend_item_width + 5 + unit_width + 10);

      legend = legend_panel.selectAll('.legend_element')
      .data(categories.domain().sort())
      .enter()
      .append('g')
      .attr('class','legend_element');

      legend.attr('transform', function(d, i) {
        return ('translate(0,' + (35 + (i + 1) * track_height) + ')');
      });

      legend.on('mouseover', function(d,i){
        var hovered_legend_element = d;

        console.log("legend hover: " + hovered_legend_element);

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "legend",
          event_detail: "legend hover: " + hovered_legend_element
        }
        usage_log.push(log_event);

        d3.select(this).select('rect').style('stroke','#f00');
        d3.select(this).select('text').style('font-weight','bolder')
        .style('fill','#f00');
        d3.selectAll('.timeline_event_g').each(function(d){
          if (d.category == hovered_legend_element || d.selected) {
            d3.select(this).selectAll('.event_span')
            .style('stroke', '#f00')
            .style("stroke-width","1.25px")
            .attr("filter", "url(#drop-shadow)");
            d3.select(this).selectAll('.event_span_component')
            .style('stroke', '#f00')
            .style("stroke-width","1px");
          }
          else {
            d3.select(this).selectAll('.event_span')
            .attr("filter", "url(#greyscale)");
            d3.select(this).selectAll('.event_span_component')
            .attr("filter", "url(#greyscale)");
          }
        })
      });

      legend.on('mouseout', function(d,i){
        d3.select(this).select('rect').style('stroke','#fff');
        d3.select(this).select('text').style('font-weight','normal')
        .style('fill','#666');
        d3.selectAll('.timeline_event_g').each(function(d){
          d3.select(this).selectAll('.event_span')
          .style('stroke', '#fff')
          .style("stroke-width","0.25px")
          .attr("filter", "none");
          d3.select(this).selectAll('.event_span_component')
          .style('stroke', '#fff')
          .style("stroke-width","0.25px")
          .attr("filter", "none");
          if (d.selected) {
            d3.select(this)
            .selectAll(".event_span")
            .attr("filter", "url(#drop-shadow)")
            .style("stroke","#f00")
            .style("stroke-width","1.25px");
            d3.select(this)
            .selectAll(".event_span_component")
            .style("stroke","#f00")
            .style("stroke-width","1px");
          }
        })
      });

      legend.append('rect')
      .attr('class','legend_element')
      .attr('x', legend_spacing)
      .attr('width', legend_rect_size)
      .attr('height', legend_rect_size)
      .attr('transform', 'translate(0,-35)')
      .style('fill', categories)
      .append("title")
      .text(function (d) {
        return d;
      });

      legend.append('text')
      .attr('class','legend_element')
      .attr('x',legend_rect_size + 2 * legend_spacing)
      .attr('y', legend_rect_size - legend_spacing)
      .attr('dy', 3)
      .style("fill-opacity", "1")
      .style("display", "inline")
      .attr('transform', 'translate(0,-35)')
      .text(function(d) {
        return d;
      });

      legend_panel.append("text")
      .text("LEGEND")
      .attr('class','legend_title')
      .attr('dy','1.4em')
      .attr('dx','0em')
      .attr('transform', 'translate(5,0)rotate(0)');
    }
  };

  function expandLegend () {

    d3.select(".legend")
    .transition()
    .duration(500)
    d3.select(".legend").select(".legend_rect")
    .transition()
    .duration(500)
    .attr('height',track_height * (num_categories + 1))
    .attr('width', max_legend_item_width + 5 + unit_width + 10)
    d3.select(".legend").select(".legend_title")
    .transition()
    .duration(500)
    .attr('dx','0em')
    .attr('transform', 'translate(5,0)rotate(0)');
    d3.select(".legend").selectAll(".legend_element text")
    .transition()
    .duration(500)
    .style("fill-opacity", "1")
    .style("display", "inline")
    .attr('transform', 'translate(0,-35)');
    d3.select(".legend").selectAll(".legend_element rect")
    .transition()
    .duration(500)
    .attr('transform', 'translate(0,-35)');

  };

  function collapseLegend () {

    d3.select(".legend")
    .transition()
    .duration(500)
    .style("z-index", 1)
    d3.select(".legend").select(".legend_rect")
    .transition()
    .duration(500)
    .attr('height', 35 + track_height * (num_categories + 1))
    .attr('width', 25)
    d3.select(".legend").select(".legend_title")
    .transition()
    .duration(500)
    .attr('dx','-4.3em')
    .attr('transform', 'translate(0,0)rotate(270)');
    d3.select(".legend").selectAll(".legend_element text")
    .transition()
    .duration(500)
    .style("fill-opacity", "0")
    .style("display", "none")
    .attr('transform', 'translate(0,0)');
    d3.select(".legend").selectAll(".legend_element rect")
    .transition()
    .duration(500)
    .attr('transform', 'translate(0,0)');

  };

  /**

  --------------------------------------------------------------------------------------
  TIMELINE DATA PROCESSING UTILITY FUNCTIONS
  --------------------------------------------------------------------------------------
  **/

  function parseDates (data) {

    var i = 0;

    //parse the event dates
    //assign an end date if none is provided
    data.forEach(function (item) {
      if (item.end_date == "" || item.end_date == null) { //if end_date is empty, set it to equal start_date
        item.end_date = item.start_date;
      }

      //if there are numerical dates before -9999 or after 10000, don't attempt to parse them
      if (date_granularity == "epochs"){
        item.event_id = i;
        active_event_list.push(i);
        i++;
        return;
      }

      //watch out for dates that start/end in BC
      var bc_start;
      var bc_end;

      // is start date a numeric year?
      if (isNumber(item.start_date)) {

        if (item.start_date < 1) {// is start_date is before 1 AD?
          bc_start = item.start_date;
        }

        if (item.end_date < 1) {// is end_date is before 1 AD?
          bc_end = item.end_date;
        }

        //convert start_date to date object
        item.start_date = moment((new Date(item.start_date))).toDate();
        item.start_date = new Date(item.start_date.valueOf() + item.start_date.getTimezoneOffset() * 60000);

        //convert end_date to date object
        item.end_date = moment((new Date(item.end_date))).toDate();
        item.end_date = new Date(item.end_date.valueOf() + item.end_date.getTimezoneOffset() * 60000);

        item.event_id = i;
        active_event_list.push(i);
        i++;

        // is end_date = start_date?
        if (item.end_date == item.start_date) {
          //if yes, set end_date to end of year
          item.end_date = moment(item.end_date).endOf("year").toDate();
        }

        //if end year given, set end_date to end of that year as date object
        else {
          item.end_date = moment(item.end_date).endOf("year").toDate();
        }

        //if start_date before 1 AD, set year manually
        if (bc_start) {
          item.start_date.setUTCFullYear(("0000" + bc_start).slice(-4) * -1);
        }

        //if end_date before 1 AD, set year manually
        if (bc_end) {
          item.end_date.setUTCFullYear(("0000" + bc_end).slice(-4) * -1);
        }

      }

      //start date is not a numeric year
      else {

        date_granularity = "days";

        //check for start_date string validity
        if (moment(item.start_date).isValid()) {
          item.start_date = moment(item.start_date).startOf("hour").toDate(); // account for UTC offset
          item.start_date = new Date(item.start_date.valueOf() + item.start_date.getTimezoneOffset() * 60000);
          item.event_id = i;
          active_event_list.push(i);
          i++;

        }
        else {
          item.start_date = undefined;
        }

        //check for end_date string validity
        if (moment(item.end_date).isValid()) {
          item.end_date = moment(item.end_date).endOf("hour").toDate(); // account for UTC offset
          item.end_date = new Date(item.end_date.valueOf() + item.end_date.getTimezoneOffset() * 60000);
        }
        else {
          item.end_date = undefined;
        }

      }

      active_event_list.push(item.event_id);
      prev_active_event_list.push(item.event_id);
      all_event_ids.push(item.event_id);

    });
  };

  //sort events according to start / end dates
  //see bl.ocks.org/rengel-de/5603464
  function compareAscending (item1, item2) {

    // Every item must have two fields: 'start_date' and 'end_date'.
    var result = item1.start_date - item2.start_date;

    // later first
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    // shorter first
    result = item2.end_date - item1.end_date;
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    //categorical tie-breaker
    if (item1.category < item2.category) {
      return -1;
    }
    if (item1.category > item2.category) {
      return 1;
    }

    //facet tie-breaker
    if (item1.facet < item2.facet) {
      return -1;
    }
    if (item1.facet > item2.facet) {
      return 1;
    }
    return 0;
  };

  //assign a track to each event item to prevent event overlap
  //see bl.ocks.org/rengel-de/5603464
  function assignTracks (data,tracks,layout) {

    //reset tracks first
    data.forEach(function (item) {
      item.track = 0;
    });

    var i, track, min_width, effective_width;

    if (date_granularity != "epochs"){
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });

      if (width > (window.innerWidth - margin.right - margin.left - getScrollbarWidth())) {
        effective_width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
      }
      else {
        effective_width = width;
      }

      var w = (effective_width - padding.left - padding.right - unit_width),
      d = (data.max_end_date.getTime() - data.min_start_date.getTime());

      if (segment_granularity == "days") {
        min_width = 0;
      }
      else if (layout == "Segmented") {
        min_width = 0;
      }
      else {
        min_width = (d/w * unit_width);
      }

      // console.log("total width: " + w + "px")
      // console.log("total duration: " + d + "ms");
      // console.log((d/w) + "ms/px" );
      // console.log("unit_width: " +  (d/w * unit_width) + "ms" );
    }

    // older items end deeper
    data.forEach(function (item) {
      if (date_granularity == "epochs") {
        item.track = 0;
      }
      else {
        for (i = 0, track = 0; i < tracks.length; i++, track++) {
          if (segment_granularity == "days") {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "weeks") {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "months") {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "years") {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "decades" && date_granularity == "days" && data.max_duration < 31) {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "centuries" && date_granularity == "days" && data.max_duration < 31) {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else if (segment_granularity == "millenia") {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
          else {
            if (item.start_date.getTime() > tracks[i].getTime()) { // + min_width
              break;
            }
          }
        }
        item.track = track;

        if (min_width > item.end_date.getTime() - item.start_date.getTime()) {

          tracks[track] = moment(item.end_date.getTime() + min_width).toDate();
        }
        else {
          tracks[track] = item.end_date;
        }

      }
    });

    num_tracks = d3.max(data, function (d) {
      return d.track;
    });
  };

  //assign a track to each event item to prevent event overlap
  function assignSequenceTracks (data,seq_tracks) {

    var angle = 0,
    j = 0;

    //reset tracks and indices first, assign spiral coordinates
    data.forEach(function (item) {
      item.item_index = j;
      if (!dirty_curve) {
        item.curve_x = (j * spiral_padding) % (width - margin.left - margin.right - spiral_padding - unit_width);
        item.curve_y = Math.floor((j * spiral_padding) / (width - margin.left - margin.right - spiral_padding - unit_width)) * spiral_padding;
      }
      item.seq_track = 0;
      item.seq_index = 0;
      var radius = Math.sqrt(j + 1);
      angle += Math.asin(1/radius);
      j++;
      item.spiral_index = j;
      item.spiral_x = Math.cos(angle) * (radius * spiral_padding);
      item.spiral_y = Math.sin(angle) * (radius * spiral_padding);
    });

    max_item_index = d3.max(data, function (d) { return d.item_index });

    var i,
    seq_track,
    index = 0,
    latest_start_date = 0;
    if (date_granularity != "epochs") {
      latest_start_date = data[0].start_date.getTime();
    }

    // older items end deeper
    data.forEach(function (item) {
      item.seq_index = index;
      item.seq_track = 0;
      index++;

      //uncomment to move simultaneous events to other tracks, comment to keep sequence as single track

      // if (date_granularity == "epochs") {
      //     item.seq_index = index;
      //     item.seq_track = 0;
      //     index++;
      // }
      // else {
      //     if (item.start_date.getTime() > latest_start_date) {
      //         latest_start_date = item.start_date.getTime();
      //         index++;
      //     }
      //     for (i = 0, seq_track = 0; i < seq_tracks.length; i++, seq_track++) {
      //         if (item.start_date.getTime() > seq_tracks[i].getTime()) {
      //             break;
      //         }
      //     }
      //     item.seq_index = index;
      //     item.seq_track = seq_track;
      //     seq_tracks[seq_track] = item.start_date;
      // }
    });

    num_seq_tracks = d3.max(data, function (d) {
      return d.seq_track;
    });

  };

  //analyze each facet individually and assign within-facet tracks and relative start and end dates
  function processFacets (data) {

    max_end_age = 0;
    max_num_tracks = 0;
    max_num_seq_tracks = 0;

    //calculate derived age measure for each event in each timeline
    timeline_facets.forEach(function (timeline) {

      //determine maximum number of tracks for chronological and sequential scales
      assignTracks(timeline.values,[],"Faceted");
      assignSequenceTracks(timeline.values,[]);
      timeline.values.num_tracks = d3.max(timeline.values, function (d) {
        return d.track;
      });
      timeline.values.num_seq_tracks = d3.max(timeline.values, function (d) {
        return d.seq_track;
      });

      if (timeline.values.num_tracks > max_num_tracks) {
        max_num_tracks = timeline.values.num_tracks + 1;
      }

      if (timeline.values.num_seq_tracks > max_num_seq_tracks) {
        max_num_seq_tracks = timeline.values.num_seq_tracks + 1;
      }

      timeline.values.min_start_date = d3.min(timeline.values, function (d) {
        return d.start_date;
      });

      var angle = 0;
      var i = 0;

      timeline.values.forEach(function (item) {

        //assign spiral coordinates
        var radius = Math.sqrt(i + 1);
        angle += Math.asin(1/radius);
        i++;
        item.spiral_index = i;
        item.spiral_x = Math.cos(angle) * (radius * spiral_padding);
        item.spiral_x = Math.sin(angle) * (radius * spiral_padding);

        if (date_granularity == "epochs") {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = "";
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = "";
        }
        else {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = moment(timeline.values.min_start_date).from(moment(item.start_date),true);
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = moment(timeline.values.min_start_date).from(moment(item.end_date),true);
        }
      });
      timeline.values.max_end_age = d3.max(timeline.values, function (d) {
        return d.end_age;
      });

      if (timeline.values.max_end_age > max_end_age) {
        max_end_age = timeline.values.max_end_age;
      }
    });
  };

  function getSegmentGranularity (min_date,max_date) {

    if (min_date == undefined || max_date == undefined) {
      return "";
    }

    var timeline_range,  // limit the number of facets to less than 20, rounding up / down to nearest natural temporal boundary
    days_to_years; // flag for transitioning to granularities of years or longer

    if (date_granularity == "days"){

      timeline_range = time.day.count(time.day.floor(min_date),time.day.floor(max_date));

      if (timeline_range <= 7) {
        return "days";
      }
      else if (timeline_range > 7 && timeline_range <= 42) {
        return "weeks";
      }
      else if (timeline_range > 42 && timeline_range <= 732) {
        return "months";
      }
      else {
        days_to_years = true;
      }
    }
    if (date_granularity == "years" || days_to_years){

      timeline_range = max_date.getUTCFullYear() - min_date.getUTCFullYear();

      if (timeline_range <= 10) {
        return "years";
      }
      else if (timeline_range > 10 && timeline_range <= 100) {
        return "decades";
      }
      else if (timeline_range > 100 && timeline_range <= 1000) {
        return "centuries";
      }
      else {
        return "millenia";
      }
    }
    else if (date_granularity == "epochs") {
      return "epochs";
    }

  };

  function getSegment (item) {

    var segment = "";

    switch (segment_granularity) {
      case "days":
      segment = moment(item.end_date).year().toString() + "." + moment(item.end_date).month().toString() + "." + moment(item.end_date).date().toString();
      break;
      case "weeks":
      segment = moment(item).year().toString() + "." + moment(item).isoWeek().toString();
      break;
      case "months":
      segment = moment(item).year().toString() + "." + moment(item).month().toString();
      break;
      case "years":
      segment = moment(item).year().toString();
      break;
      case "decades":
      var decade = Math.floor(item.getUTCFullYear() / 10) * 10;
      segment = decade.toString();
      break;
      case "centuries":
      var century = Math.floor(item.getUTCFullYear() / 100) * 100;
      segment = century.toString();
      break;
      case "millenia":
      var millenia = Math.floor(item.getUTCFullYear() / 1000) * 1000;
      segment = millenia.toString();
      break;
      case "epochs":
      segment = "";
      break;
    }
    return segment;
  };

  //function for checking if string is a number
  //stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
  function isNumber (n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  };

  //resizes the timeline container based on combination of scale, layout, representation
  function determineSize(data, scale, layout, representation) {

    console.log("timeline: " + scale + " - " + layout + " - " + representation);

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "sizing",
      event_detail: "timeline: " + scale + " - " + layout + " - " + representation
    }
    usage_log.push(log_event);

    switch (representation) {

      case "Linear":
      switch (scale) {

        case "Chronological":
        switch (layout) {

          case "Unified":
          //justifiable
          assignTracks(data,[],layout);
          console.log("# tracks: " + num_tracks);

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# tracks: " + num_tracks
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = num_tracks * track_height + 1.5 * track_height + margin.top + margin.bottom;
          break;

          case "Faceted":
          //justifiable
          processFacets(data);
          console.log("# within-facet tracks: " + (max_num_tracks + 1));

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# within-facet tracks: " + (max_num_tracks + 1)
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = (max_num_tracks * track_height + 1.5 * track_height) * num_facets + margin.top + margin.bottom;
          break;

          case "Segmented":
          //justifiable
          assignTracks(data,[],layout);
          console.log("# tracks: " + num_tracks);

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# tracks: " + num_tracks
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = (num_tracks * track_height + 1.5 * track_height) * num_segments + margin.top + margin.bottom;
          break;
        }
        break;

        case "Relative":
        if (layout == "Faceted") {
          //justifiable
          processFacets(data);
          console.log("# within-facet tracks: " + (max_num_tracks + 1));

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# within-facet tracks: " + (max_num_tracks + 1)
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = (max_num_tracks * track_height + 1.5 * track_height) * num_facets + margin.top + margin.bottom;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;

        case "Log":
        if (layout == "Unified") {
          //justifiable
          assignTracks(data,[],layout);
          console.log("# tracks: " + num_tracks);

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# tracks: " + num_tracks
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = num_tracks * track_height + 1.5 * track_height + margin.top + margin.bottom;
        }
        else if (layout == "Faceted") {
          //justifiable
          processFacets(data);
          console.log("# within-facet tracks: " + (max_num_tracks + 1));

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# within-facet tracks: " + (max_num_tracks + 1)
          }
          usage_log.push(log_event);

          width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
          height = (max_num_tracks * track_height + 1.5 * track_height) * num_facets + margin.top + margin.bottom;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;

        case "Collapsed":
        if (layout == "Unified") {
          //justifiable
          assignSequenceTracks(data,[]);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
          var bar_chart_height = (4 * unit_width);
          width = max_seq_index * 1.5 * unit_width +  margin.left + 3 * margin.right;
          height = (num_seq_tracks * track_height + 1.5 * track_height) + bar_chart_height + margin.top + margin.bottom;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;

        case "Sequential":
        if (layout == "Unified") {
          //justifiable
          assignSequenceTracks(data,[]);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
          width = d3.max([
            max_seq_index * 1.5 * unit_width + margin.left + margin.right,
            window.innerWidth - margin.right - margin.left - getScrollbarWidth()
          ]);
          height = num_seq_tracks * track_height + 1.5 * track_height + margin.top + margin.bottom;
        }
        else if (layout == "Faceted") {
          //justifiable
          processFacets(data);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
          width = d3.max([
            max_seq_index * 1.5 * unit_width + margin.left + margin.right,
            window.innerWidth - margin.right - margin.left - getScrollbarWidth()
          ]);
          height = (max_num_seq_tracks * track_height + 1.5 * track_height) * num_facets + margin.top + margin.bottom;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;
      }
      break;

      case "Radial":

      centre_radius = 50;

      var effective_size = window.innerWidth - margin.right - padding.right - margin.left - padding.left - getScrollbarWidth();

      switch (scale) {

        case "Chronological":

        switch (layout) {

          case "Unified":
          //justifiable
          assignTracks(data,[],layout);
          console.log("# tracks: " + num_tracks);

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# tracks: " + num_tracks
          }
          usage_log.push(log_event);

          centre_radius = d3.max([50,(effective_size - ((num_tracks + 2) * 2 * track_height)) / 2]);
          width = (2 * centre_radius + (num_tracks + 2) * 2 * track_height) + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + (num_tracks + 2) * 2 * track_height) + margin.top + margin.bottom;
          break;

          case "Faceted":
          //justifiable
          processFacets(data);

          centre_radius = 50;
          var estimated_facet_width = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height);

          num_facet_cols = d3.max([1,d3.min([num_facet_cols,Math.floor(effective_size / estimated_facet_width)])]);
          num_facet_rows = Math.ceil(num_facets / num_facet_cols);

          centre_radius = d3.max([50,(effective_size / num_facet_cols - ((max_num_tracks + 2) * 2 * track_height)) / 2]);
          width = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height) * num_facet_cols + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height) * num_facet_rows + margin.top + margin.bottom + num_facet_rows * buffer;
          break;

          case "Segmented":
          //justifiable
          assignTracks(data,[],layout);
          console.log("# tracks: " + num_tracks);

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# tracks: " + num_tracks
          }
          usage_log.push(log_event);

          centre_radius = 50;
          var estimated_segment_width =  (2 * centre_radius + (num_tracks + 2) * 2 * track_height);

          num_segment_cols = d3.max([1,d3.min([num_segment_cols,Math.floor(effective_size / estimated_segment_width)])]);
          num_segment_rows = Math.ceil(num_segments / num_segment_cols);

          centre_radius = d3.max([50,(effective_size / num_segment_cols - ((num_tracks + 2) * 2 * track_height)) / 2]);
          width = (2 * centre_radius + (num_tracks + 2) * 2 * track_height) * num_segment_cols + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + (num_tracks + 2) * 2 * track_height) * num_segment_rows + margin.top + margin.bottom + num_segment_rows * buffer;
          break;
        }
        break;

        case "Relative":
        if (layout == "Faceted") {

          //justifiable
          processFacets(data);
          console.log("# within-facet tracks: " + (max_num_tracks + 1));

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "sizing",
            event_detail: "# within-facet tracks: " + (max_num_tracks + 1)
          }
          usage_log.push(log_event);

          centre_radius = 50;
          var estimated_facet_width = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height);

          num_facet_cols = d3.min([num_facet_cols,Math.floor(effective_size / estimated_facet_width)]);
          num_facet_rows = Math.ceil(num_facets / num_facet_cols);

          centre_radius = d3.max([50,(effective_size / num_facet_cols - ((max_num_tracks + 2) * 2 * track_height)) / 2]);
          width = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height) * num_facet_cols + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + (max_num_tracks + 2) * 2 * track_height) * num_facet_rows + margin.top + margin.bottom + num_facet_rows * buffer;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;

        case "Sequential":
        if (layout == "Unified") {

          //justifiable
          assignSequenceTracks(data,[]);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
          centre_radius = (effective_size - (4 * track_height)) / 2;
          width = (2 * centre_radius + 4 * track_height) + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + 4 * track_height) + margin.top + margin.bottom;
        }
        else if (layout == "Faceted") {
          //justifiable

          processFacets(data);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;

          centre_radius = 50;
          var estimated_facet_width = (2 * centre_radius + (4 * track_height));

          num_facet_cols = d3.min([num_facet_cols,Math.floor(effective_size / estimated_facet_width)]);
          num_facet_rows = Math.ceil(num_facets / num_facet_cols);

          centre_radius = d3.max([50,(effective_size / num_facet_cols - (4 * track_height)) / 2]);
          width = (2 * centre_radius + 4 * track_height) * num_facet_cols + margin.left + margin.right;
          if (centre_radius > 200)
          centre_radius = 200;
          height = (2 * centre_radius + 4 * track_height) * num_facet_rows + margin.top + margin.bottom + num_facet_rows * buffer;
        }
        else {
          //not justifiable
          console.log("scale-layout-representation combination not possible/justifiable");

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "error",
            event_detail: "scale-layout-representation combination not possible/justifiable"
          }
          usage_log.push(log_event);

          width = 0;
          height = 0;
        }
        break;
      }
      break;

      case "Grid":

      if (scale == "Chronological" && layout == "Segmented") {
        //justifiable

        assignTracks(data,[],layout);

        var cell_size = 50,
        century_height = cell_size * unit_width,
        century_width = cell_size * 10;

        //determine the range, round to whole centuries
        var range_floor = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100,
        range_ceil = Math.ceil((data.max_end_date.getUTCFullYear() + 1) / 100) * 100;

        //determine the time domain of the data along a linear quantitative scale
        var year_range = d3.range(range_floor,range_ceil);

        //determine maximum number of centuries given year_range
        var num_centuries = (Math.ceil(year_range.length / 100));

        width = century_width + margin.left + margin.right;
        height = num_centuries * century_height + num_centuries * cell_size + margin.top + margin.bottom - cell_size;
      }
      else {
        //not justifiable
        console.log("scale-layout-representation combination not possible/justifiable");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "error",
          event_detail: "scale-layout-representation combination not possible/justifiable"
        }
        usage_log.push(log_event);

        width = 0;
        height = 0;
      }
      break;

      case "Calendar":

      if (scale == "Chronological" && layout == "Segmented") {
        //justifiable

        assignTracks(data,[],layout);

        var cell_size = 20,
        year_height = cell_size * 8, //7 days of week + buffer
        year_width = cell_size * 53; //53 weeks of the year + buffer

        //determine the range, round to whole centuries
        var range_floor = data.min_start_date.getUTCFullYear(),
        range_ceil = data.max_end_date.getUTCFullYear();

        //determine the time domain of the data along a linear quantitative scale
        var year_range = d3.range(range_floor,range_ceil + 1);

        width = year_width + margin.left + margin.right;
        height = year_range.length * year_height + margin.top + margin.bottom - cell_size;
      }
      else {
        //not justifiable
        console.log("scale-layout-representation combination not possible/justifiable");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "error",
          event_detail: "scale-layout-representation combination not possible/justifiable"
        }
        usage_log.push(log_event);

        width = 0;
        height = 0;
      }
      break;

      case "Spiral":

      if (scale == "Sequential") {
        if (layout == "Unified") {
          //justifiable

          assignSequenceTracks(data,[]);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
          var angle = 0,
          i = 0;

          data.forEach(function (item) {
            var radius = Math.sqrt(i + 1);
            angle += Math.asin(1/radius);
            i++;
            item.spiral_index = i;
            item.spiral_x = Math.cos(angle) * (radius * spiral_padding);
            item.spiral_y = Math.sin(angle) * (radius * spiral_padding);
          });

          var max_x = d3.max(data, function (d) { return d.spiral_x });
          var max_y = d3.max(data, function (d) { return d.spiral_y });
          var min_x = d3.min(data, function (d) { return d.spiral_x });
          var min_y = d3.min(data, function (d) { return d.spiral_y });

          spiral_dim = d3.max([(max_x + 2 * spiral_padding) - (min_x - 2 * spiral_padding),(max_y + 2 * spiral_padding) - (min_y - 2 * spiral_padding)]);

          width = d3.max([
            spiral_dim + spiral_padding + margin.right + margin.left,
            window.innerWidth - margin.right - margin.left - getScrollbarWidth()
          ]);
          height = d3.max([
            spiral_dim + spiral_padding + margin.top + margin.bottom,
            window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()
          ]);
        }
        else if (layout == "Faceted") {
          //justifiable
          processFacets(data);
          max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;

          timeline_facets.forEach(function (timeline) {

            var angle = 0,
            i = 0;

            timeline.values.forEach(function (item) {
              var radius = Math.sqrt(i + 1);
              angle += Math.asin(1/radius);
              i++;
              item.spiral_index = i;
              item.spiral_x = Math.cos(angle) * (radius * spiral_padding);
              item.spiral_y = Math.sin(angle) * (radius * spiral_padding);
            });

          });

          var max_x = d3.max(data, function (d) { return d.spiral_x });
          var max_y = d3.max(data, function (d) { return d.spiral_y });
          var min_x = d3.min(data, function (d) { return d.spiral_x });
          var min_y = d3.min(data, function (d) { return d.spiral_y });

          spiral_dim = d3.max([(max_x + 2 * spiral_padding) - (min_x - 2 * spiral_padding),(max_y + 2 * spiral_padding) - (min_y - 2 * spiral_padding)]);

          var facet_number = 0,
          effective_size = window.innerWidth - margin.right - margin.left - getScrollbarWidth();

          num_facet_cols = d3.min([num_facet_cols,Math.floor(effective_size / spiral_dim)]);
          num_facet_rows = Math.ceil(num_facets / num_facet_cols);

          width = d3.max([
            num_facet_cols * spiral_dim + margin.right + margin.left,
            window.innerWidth - margin.right - margin.left - getScrollbarWidth()
          ]);
          height = num_facet_rows * spiral_dim + margin.top + margin.bottom;
        }
        else {
          //not justifiable
          width = 0;
          height = 0;
        }

      }
      else {
        //not justifiable
        console.log("scale-layout-representation combination not possible/justifiable");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "error",
          event_detail: "scale-layout-representation combination not possible/justifiable"
        }
        usage_log.push(log_event);

        width = 0;
        height = 0;
      }
      break;

      case "Curve":
      if (scale == "Sequential" && layout == "Unified") {
        //justifiable
        assignSequenceTracks(data,[]);
        max_seq_index = d3.max(data, function (d) { return d.seq_index }) + 1;
        width = window.innerWidth - margin.right - margin.left - getScrollbarWidth();
        height = window.innerHeight - margin.top - margin.bottom - getScrollbarWidth();
      }
      else {
        //not justifiable
        console.log("scale-layout-representation combination not possible/justifiable");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "error",
          event_detail: "scale-layout-representation combination not possible/justifiable"
        }
        usage_log.push(log_event);

        width = 0;
        height = 0;
      }
      break;
    }
    console.log("dimensions: " + width + " (W) x " + height  + " (H)");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "sizing",
      event_detail: "dimensions: " + width + " (W) x " + height  + " (H)"
    }
    usage_log.push(log_event);

  };

  function updateRadioBttns (scale, layout, representation) {

    //update the control radio buttons
    d3.selectAll("#scale_picker input[name=scale_rb]").property("checked", function (d, i) {
      return d == scale;
    });
    d3.selectAll("#layout_picker input[name=layout_rb]").property("checked", function (d, i) {
      return d == layout;
    });
    d3.selectAll("#representation_picker input[name=representation_rb]").property("checked",function (d, i) {
      return d == representation;
    });

    d3.selectAll('#scale_picker img')
    .style("border-bottom", function(d,i) {
      if (d.name == scale)
      return '2px solid #f00';
    })
    .style("border-right", function(d,i) {
      if (d.name == scale)
      return '2px solid #f00';
    });
    d3.selectAll('#layout_picker img')
    .style("border-bottom",function(d,i) {
      if (d.name == layout)
      return '2px solid #f00';
    })
    .style("border-right",function(d,i) {
      if (d.name == layout)
      return '2px solid #f00';
    });
    d3.selectAll('#representation_picker img')
    .style("border-bottom", function(d,i) {
      if (d.name == representation)
      return '2px solid #f00';
    })
    .style("border-right", function(d,i) {
      if (d.name == representation)
      return '2px solid #f00';
    });

    d3.selectAll(".option_rb").select("input").property("disabled", function (d) {

      switch (d.name) {

        case "Chronological":
        if (representation != "Spiral" && representation != "Curve") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Relative":
        if (layout == "Faceted" && (representation == "Linear" || representation == "Radial")) {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Log":
        if (representation == "Linear" && layout != "Segmented") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Collapsed":
        if (representation == "Linear" && layout == "Unified") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Sequential":
        if ((representation != "Grid" && representation != "Calendar") && layout != "Segmented") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Unified":
        if (scale != "Relative" && representation != "Grid" && representation != "Calendar") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Faceted":
        if (scale != "Collapsed" && representation != "Grid" && representation != "Calendar" && representation != "Curve" && total_num_facets > 1) {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Segmented":
        if (scale == "Chronological" && representation != "Spiral" && representation != "Curve") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Linear":
        return false;
        break;

        case "Calendar":
        if (scale == "Chronological" && layout == "Segmented") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Grid":
        if (scale == "Chronological" && layout == "Segmented") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Radial":
        if (scale != "Log" && scale != "Collapsed") {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Spiral":
        if (scale == "Sequential" && (layout == "Unified" || layout == "Faceted")) {
          return false;
        }
        else {
          return true;
        }
        break;

        case "Curve":
        if (scale == "Sequential" && layout == "Unified") {
          return false;
        }
        else {
          return true;
        }
        break;
      }
    });

    d3.selectAll(".option_rb").select("img").attr("class", function (d) {

      switch (d.name) {

        case "Chronological":
        if (representation != "Spiral" && representation != "Curve") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Relative":
        if (layout == "Faceted" && (representation == "Linear" || representation == "Radial")) {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Log":
        if (representation == "Linear" && layout != "Segmented") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Collapsed":
        if (representation == "Linear" && layout == "Unified") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Sequential":
        if ((representation != "Grid" && representation != "Calendar") && layout != "Segmented") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Unified":
        if (scale != "Relative" && representation != "Grid" && representation != "Calendar") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Faceted":
        if (scale != "Collapsed" && representation != "Grid" && representation != "Calendar" && representation != "Curve" && total_num_facets > 1) {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Segmented":
        if (scale == "Chronological" && representation != "Spiral" && representation != "Curve") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Linear":
        return "img_btn_enabled";
        break;

        case "Calendar":
        if (scale == "Chronological" && layout == "Segmented") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Grid":
        if (scale == "Chronological" && layout == "Segmented") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Radial":
        if (scale != "Log" && scale != "Collapsed") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Spiral":
        if (scale == "Sequential" && (layout == "Unified" || layout == "Faceted")) {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;

        case "Curve":
        if (scale == "Sequential" && layout == "Unified") {
          return "img_btn_enabled";
        }
        else {
          return "img_btn_disabled";
        }
        break;
      }
    });
  };

  //highlight matches and de-emphasize (grey-out) mismatches
  dispatch.on("highlight", function (selected_categories, selected_facets, selected_segments) {

    filter_transition = true;

    var timeline_events = d3.selectAll(".timeline_event_g");
    var matches, mismatches,
    selected_category_values = [],
    selected_facet_values = [],
    selected_segment_values = [];

    prev_active_event_list = active_event_list;

    active_event_list = [];

    selected_categories[0].forEach( function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach( function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach( function (item) {
      selected_segment_values.push(item.__data__);
    });

    mismatches = timeline_events.filter( function (d) {
      return (selected_category_values.indexOf("( All )") == -1 && selected_category_values.indexOf(d.category) == -1) ||
      (selected_facet_values.indexOf("( All )") == -1 && selected_facet_values.indexOf(d.facet) == -1) ||
      (selected_segment_values.indexOf("( All )") == -1 && selected_segment_values.indexOf(d.segment) == -1);
    });

    matches = timeline_events.filter( function (d) {
      return (selected_category_values.indexOf("( All )") != -1 || selected_category_values.indexOf(d.category) != -1) &&
      (selected_facet_values.indexOf("( All )") != -1 || selected_facet_values.indexOf(d.facet) != -1) &&
      (selected_segment_values.indexOf("( All )") != -1 || selected_segment_values.indexOf(d.segment) != -1);
    });

    if (mismatches [0].length != 0) {
      console.log(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "highlight",
        event_detail: matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events"
      }
      usage_log.push(log_event);

    }
    else {
      console.log(matches[0].length + " events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "highlight",
        event_detail: matches[0].length + " events"
      }
      usage_log.push(log_event);
    }

    all_data.forEach( function (item) {
      if ((selected_category_values.indexOf("( All )") != -1 || selected_category_values.indexOf(item.category) != -1) &&
      (selected_facet_values.indexOf("( All )") != -1 || selected_facet_values.indexOf(item.facet) != -1) &&
      (selected_segment_values.indexOf("( All )") != -1 || selected_segment_values.indexOf(item.segment) != -1)) {
        active_event_list.push(item.event_id);
      }
    });

    main_svg.call(timeline_vis.duration(1200));

    filter_transition = false;
    prev_active_event_list = active_event_list;

  });

  //remove mismatches
  dispatch.on("remove", function (selected_categories, selected_facets, selected_segments) {

    filter_transition = true;

    prev_active_event_list = active_event_list;
    active_event_list = [];

    timeline_vis.previous_segment_granularity(segment_granularity);

    var matches, mismatches,
    selected_category_values = [],
    selected_facet_values = [],
    selected_segment_values = [],
    reset_segmented_layout = false;

    selected_categories[0].forEach( function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach( function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach( function (item) {
      selected_segment_values.push(item.__data__);
    });

    all_data.forEach( function (item) {
      if ((selected_category_values.indexOf("( All )") != -1 || selected_category_values.indexOf(item.category) != -1) &&
      (selected_facet_values.indexOf("( All )") != -1 || selected_facet_values.indexOf(item.facet) != -1) &&
      (selected_segment_values.indexOf("( All )") != -1 || selected_segment_values.indexOf(item.segment) != -1)) {
        active_event_list.push(item.event_id);
      }
    });

    mismatches = d3.selectAll(".timeline_event_g").filter(function (d) {
      return active_event_list.indexOf(d.event_id) == -1;
    });

    matches = d3.selectAll(".timeline_event_g").filter(function (d) {
      return active_event_list.indexOf(d.event_id) != -1;
    });

    active_data = all_data.filter( function (d) {
      return active_event_list.indexOf(d.event_id) != -1;
    });

    if (mismatches [0].length != 0) {
      console.log(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "remove",
        event_detail: matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events"
      }
      usage_log.push(log_event);
    }
    else {
      console.log(matches[0].length + " events");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "remove",
        event_detail: matches[0].length + " events"
      }
      usage_log.push(log_event);
    }

    measureTimeline(active_data);

    all_data.min_start_date = active_data.min_start_date;
    all_data.max_end_date = active_data.max_end_date;

    max_end_age = 0;

    //determine facets (separate timelines) from data
    facets.domain(active_data.map(function (d) {
      return d.facet;
    }));

    facets.domain().sort();

    num_facets = facets.domain().length;
    num_facet_cols = Math.ceil(Math.sqrt(num_facets));
    num_facet_rows = Math.ceil(num_facets / num_facet_cols);

    console.log("num facets: " + num_facet_cols)

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "remove",
      event_detail: "num facets: " + num_facet_cols
    }
    usage_log.push(log_event);

    determineSize(active_data,timeline_vis.tl_scale(),timeline_vis.tl_layout(),timeline_vis.tl_representation());

    console.log("num facets after sizing: " + num_facet_cols)

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "remove",
      event_detail: "num facets after sizing: " + num_facet_cols
    }
    usage_log.push(log_event);

    main_svg.transition()
    .duration(1200)
    .attr("width", d3.max([width, window.innerWidth - margin.right - margin.left - getScrollbarWidth()]))
    .attr("height", d3.max([height, window.innerHeight - margin.top - margin.bottom - getScrollbarWidth()]));

    if (timeline_vis.tl_layout() == "Segmented") {
      if (timeline_vis.tl_representation() == "Grid"){
        segment_granularity = "centuries";
      }
      else if (timeline_vis.tl_representation() == "Calendar") {
        segment_granularity = "weeks";
      }
      else {
        segment_granularity = getSegmentGranularity(active_data.min_start_date,active_data.max_end_date);
      }
      if (timeline_vis.tl_representation() != "Calendar" && timeline_vis.tl_representation() != "Grid" && timeline_vis.previous_segment_granularity() != segment_granularity) {
        reset_segmented_layout = true;
        d3.selectAll(".timeline_event_g").remove();
      }
    }
    main_svg.call(timeline_vis.duration(1200).height(height).width(width));

    if (reset_segmented_layout) {

      mismatches = d3.selectAll(".timeline_event_g").filter(function (d) {
        return active_event_list.indexOf(d.event_id) == -1;
      });

      matches = d3.selectAll(".timeline_event_g").filter(function (d) {
        return active_event_list.indexOf(d.event_id) != -1;
      });

    }

    filter_transition = false;
    prev_active_event_list = active_event_list;

  });

  function importIntro(){
    var import_intro = introJs();
    import_intro.setOptions({
      steps: [
        {
          intro: "This tour will describe the types of data that the tool can ingest."
        },
        {
          element: '#demo_dataset_picker_label',
          intro: "Load one of several demonstration timeline datasets, featuring timelines that span astronomical epochs or just a single day.",
          position: 'right'
        },
        {
          element: '#json_picker_label',
          intro: "Load a timeline dataset in JSON format, where each event is specified by at least a start_date (in either YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DD HH:MM format); optionally, events can also be specified by end_date, content_text (a text string that describes the event), category, and facet (a second categorical attribute used for distinguishing between multiple timelines).",
          position: 'right'
        },
        {
          element: '#csv_picker_label',
          intro: "Load a timeline dataset in CSV format; ensure that the header row contains at least a start_date column; as with JSON datasets, end_date, content_text, category, and facet columns are optional.",
          position: 'right'
        },
        {
          element: '#gdocs_picker_label',
          intro: "Load a timeline dataset from a published Google Spreadsheet; you will need to provide the spreadsheet key and worksheet title; the worksheet columns must be formatted as text.",
          position: 'right'
        },
        {
          element: '#story_demo_label',
          intro: "Load a demonstration timeline story.",
          position: 'right'
        },
        {
          element: '#story_picker_label',
          intro: "Load a previously saved timeline story in .cdc format.",
          position: 'right'
        }
      ]
    });
    import_intro.start();
  }

  function mainIntro(){
    var main_intro = introJs();
    main_intro.setOptions({
      steps: [
        {
          intro: "This tour will introduce the timeline story authoring features."
        },
        {
          element: '#representation_picker',
          intro: "Select the visual representation of the timeline or timelines here. Note that some representations are incompatible with some combinations of scales and layouts.",
          position: 'bottom'
        },
        {
          element: '#scale_picker',
          intro: "Select the scale of the timeline or timelines here. Note that some scales are incompatible with some combinations of representations and layouts.",
          position: 'bottom'
        },
        {
          element: '#layout_picker',
          intro: "Select the layout of the timeline or timelines here. Note that some layouts are incompatible with some combinations of representations and scales.",
          position: 'bottom'
        },
        {
          element: '#import_visible_btn',
          intro: "This button toggles the import panel, allowing you to open a different timeline dataset or story.",
          position: 'right'
        },
        {
          element: '#control_panel',
          intro: "This panel contains controls for adding text or image annotations to a timeline, for highlighting and filtering events, and for exporting the timeline or timeline story.",
          position: 'right'
        },
        {
          element: '#record_scene_btn',
          intro: "This button records the current canvas of timeline or timelines, labels, and annotations as a scene in a story.",
          position: 'top'
        }
      ]
    });
    main_intro.start();
  }

  function playbackIntro(){
    var playback_intro = introJs();
    playback_intro.setOptions({
      steps: [
        {
          intro: "This tour will introduce timeline story plaback features."
        },
        {
          element: '#play_scene_btn',
          intro: "You are now in story playback mode. Click this button to leave playback mode and restore the story editing tool panels.",
          position: 'top'
        },
        {
          element: '#stepper_container',
          intro: "Scenes in the story appear in this panel. Click on any scene thumbnail to jump to the corresponding scene.",
          position: 'top'
        },
        {
          element: '#next_scene_btn',
          intro: "Advance to the next scene by clicking this button.",
          position: 'top'
        },
        {
          element: '#prev_scene_btn',
          intro: "Return to the previous scene by clicking this button.",
          position: 'top'
        }
      ]
    });
    playback_intro.start();
  }

  var intro_div = d3.select("body")
  .append("div")
  .attr("id","intro_div")
  .attr("class","control_div");

  intro_div.append("div")
  .html('<div data-hint="Click on the [TOUR] button for a tour of the interface." data-hintPosition="bottom-left" data-position="bottom-left-aligned"></div>');

  introJs().addHints();

  intro_div.append("div")
  .attr("class","intro_btn")
  .html("<a title='About & getting started' href='/about/' target='_blank'><img src='img/q.png' width=30 height=30 class='img_btn_enabled'></img></a>");

  intro_div.append("div")
  .attr("class","intro_btn")
  .html("<a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'><img src='img/mail.png' width=30 height=30 class='img_btn_enabled'></img></a>");

  intro_div.append('input')
  .attr({
    type: "image",
    name: "Start tour",
    id: "start_intro_btn",
    class: 'img_btn_enabled',
    src: 'img/info.png',
    height: 30,
    width: 30,
    title: "Start tour"
  })
  .on('click', function() {
    if (d3.select("#import_div").style("top") != -210 + "px") {
      importIntro();
    }
    else if (!playback_mode) {
      mainIntro();
    }
    else {
      playbackIntro();
    }
  });

})();
