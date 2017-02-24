/**

anotateEvent: //on-demand persistent content_text label for an event

**/


annotateEvent = function (content_text,x_pos,y_pos,x_offset,y_offset,x_anno_offset,y_anno_offset,label_width,item_index,annotation_index) {

  "use strict";

  var target;
  var LINE_OCTO = 0;
  var LINE_RECT = 1;
  var LINE_CURVE = 2;
  var annotation_buffer = 12.5;

  // Internet Explorer 6-11
  var isIE = /*@cc_on!@*/false || !!document.documentMode;

  // Edge 20+
  var isEdge = !isIE && !!window.StyleMedia;

  if (!isIE && !isEdge) {
    if (timeline_vis.tl_layout() == "Segmented") {
      if (timeline_vis.tl_representation() != "Radial") {

        target = d3.select("#event_g" + item_index + " rect.event_span_component")[0][0];

        if (target.transform.baseVal.length > 0) {
          x_offset = target.transform.baseVal[0].matrix.e;
          y_offset = target.transform.baseVal[0].matrix.f;
        }
        else {
          x_offset = 0;
          y_offset = 0;
        }

        x_pos = Math.round(target.x.baseVal.value + x_offset + padding.left + unit_width / 2);
        y_pos = Math.round(target.y.baseVal.value + y_offset + padding.top + unit_width / 2);
      }
      else {
        target = d3.select("#event_g" + item_index + " path.event_span_component").node();

        if (target.transform.baseVal.length > 0) {
          x_offset = target.transform.baseVal[0].matrix.e;
          y_offset = target.transform.baseVal[0].matrix.f;
        }
        else {
          x_offset = 0;
          y_offset = 0;
        }

        x_pos = Math.round(target.getPointAtLength(-unit_width).x + x_offset + padding.left);
        y_pos = Math.round(target.getPointAtLength(-unit_width).y + y_offset + padding.top);
      }
    }
    else {
      if (timeline_vis.tl_representation() != "Radial") {

        target = d3.select("#event_g" + item_index + " rect.event_span")[0][0];


        if (target.transform.baseVal.length > 0) {
          x_offset = target.transform.baseVal[0].matrix.e;
          y_offset = target.transform.baseVal[0].matrix.f;
        }
        else {
          x_offset = 0;
          y_offset = 0;
        }

        x_pos = Math.round(target.x.baseVal.value + x_offset + padding.left + unit_width / 2);
        y_pos = Math.round(target.y.baseVal.value + y_offset + padding.top + unit_width / 2);
      }
      else {

        target = d3.select("#event_g" + item_index + " path.event_span").node();

        if (target.transform.baseVal.length > 0) {
          x_offset = target.transform.baseVal[0].matrix.e;
          y_offset = target.transform.baseVal[0].matrix.f;
        }
        else {
          x_offset = 0;
          y_offset = 0;
        }

        x_pos = Math.round((target.getPointAtLength(-unit_width).x + target.getPointAtLength(unit_width).x) / 2 + x_offset + padding.left);
        y_pos = Math.round((target.getPointAtLength(-unit_width).y + target.getPointAtLength(unit_width).y) / 2 + y_offset + padding.top);
      }
    }
  }


  var min_label_width = label_width;

  // Benj
  var leader_line_path = [];
  var drawLeaderLine = d3.svg.line()
  .x(function(d) { return d.x; })
  .y(function(d) { return d.y; })
  // .interpolate("basis")

  if (leader_line_style == LINE_CURVE) {
    drawLeaderLine.interpolate("basis");
  }
  else {
    drawLeaderLine.interpolate("linear");
  }

  var event_annotation =  d3.select('#main_svg').append("g")
  .attr("id","event" + item_index + "_" + annotation_index)
  .attr("class","event_annotation")
  .style('opacity',0);

  event_annotation.on("mouseover", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(250)
    .style("opacity",1);
    d3.select(this).select(".annotation_frame")
    .transition()
    .duration(250)
    .style("stroke","#f00")
    .attr("filter", "url(#drop-shadow)");
  })
  .on("mouseout", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(250)
    .style("opacity",0);
    d3.select(this).select(".annotation_frame")
    .transition()
    .duration(250)
    .style("stroke","transparent")
    .attr("filter", "none");
  });

  var p;
  var drag = d3.behavior.drag()
  .origin(function () {
    var t = d3.select(this);

    return {
      x: t.attr("x"),
      y: t.attr("y")
    };
  })
  .on("drag", function () {

    x_anno_offset = d3.event.x - x_pos;
    y_anno_offset = d3.event.y - y_pos;

    var i = 0;

    while (annotation_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    annotation_list[i].x_anno_offset = x_anno_offset;
    annotation_list[i].y_anno_offset = y_anno_offset;

    d3.select(this)
    .attr('x', x_pos + x_anno_offset)
    .attr('y', y_pos + y_anno_offset);

    d3.select(this.parentNode).select(".annotation_frame")
    .attr('x', x_pos + x_anno_offset)
    .attr('y', y_pos + y_anno_offset);

    d3.select(this.parentNode).select(".event_label").selectAll("tspan")
    .attr('x', x_pos + x_anno_offset + 7.5)
    .attr('y', y_pos + y_anno_offset + annotation_buffer);

    d3.select(this.parentNode).selectAll(".frame_resizer")
    .attr('x', x_pos + x_anno_offset + label_width + 7.5)
    .attr('y', y_pos + y_anno_offset);

    d3.select(this.parentNode).selectAll(".annotation_delete")
    .attr('x', x_pos + x_anno_offset + label_width + 7.5 + 20)
    .attr('y', y_pos + y_anno_offset);

    var annotation_line_y2 = d3.select(this.parentNode).select(".annotation_frame").attr("height") / 2;

    leader_line_path[2] = {
      x: x_pos + x_anno_offset,
      y: y_pos + y_anno_offset + 18
    };
    leader_line_path[1].y = leader_line_path[2].y;
    leader_line_path[1].x = leader_line_path[0].x;

    if (x_pos + x_anno_offset > leader_line_path[0].x) {
      leader_line_path[2].x = x_pos + x_anno_offset;
    }
    else {
      leader_line_path[2].x = x_pos + x_anno_offset + label_width;
    }

    var p = d3.select(this.parentNode).select(".annotation_line")
    .data([leader_line_path])
    .attr('d', function (d) {
      return drawLeaderLine(d)
    });

  })
  .on("dragend", function() {
    console.log("event " + item_index + " annotation moved to [" + (x_pos + x_anno_offset) + "," + (y_pos + y_anno_offset) + "]");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "event " + item_index + " annotation moved to [" + (x_pos + x_anno_offset) + "," + (y_pos + y_anno_offset) + "]"
    }
    usage_log.push(log_event);
  });

  var resize = d3.behavior.drag()
  .origin(function () {
    var t = d3.select(this);

    return {
      x: t.attr("x"),
      y: t.attr("y")
    };
  })
  .on("drag", function () {

    d3.select(this).attr('x', d3.max([x_pos + x_anno_offset + label_width + 7.5,x_pos + x_anno_offset + 7.5 + (d3.event.x - (x_pos + x_anno_offset))]));

    label_width = d3.max([min_label_width,d3.event.x - (x_pos + x_anno_offset)]);

    var i = 0;

    while (annotation_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    annotation_list[i].label_width = label_width;

    d3.select(this.parentNode).select(".annotation_frame")
    .attr("width",label_width + 7.5);

    d3.select(this.parentNode).select(".annotation_drag_area")
    .attr("width",label_width + 7.5);

    d3.select(this.parentNode).select(".event_label")
    .attr("x", x_pos + x_anno_offset + 7.5)
    .attr("y", y_pos + y_anno_offset + annotation_buffer)
    .text(content_text)
    .call(wrap,label_width - 7.5);

    d3.select(this.parentNode).selectAll(".frame_resizer")
    .attr('x', x_pos + x_anno_offset + label_width + 7.5)
    .attr('y', y_pos + y_anno_offset);

    d3.select(this.parentNode).selectAll(".annotation_delete")
    .attr('x', x_pos + x_anno_offset + label_width + 7.5 + 20)
    .attr('y', y_pos + y_anno_offset);

    var annotation_line_y2 = d3.select(this.parentNode).select(".annotation_frame").attr("height") / 2;

    leader_line_path[2] = {
      x: x_pos + x_anno_offset,
      y: y_pos + y_anno_offset + 18
    };
    leader_line_path[1].y = leader_line_path[2].y;
    leader_line_path[1].x = leader_line_path[0].x;

    if (x_pos + x_anno_offset > leader_line_path[0].x) {
      leader_line_path[2].x = x_pos + x_anno_offset;
    }
    else {
      leader_line_path[2].x = x_pos + x_anno_offset + label_width;
    }

    var p = d3.select(this.parentNode).select(".annotation_line")
    .data([leader_line_path])
    .attr('d', function (d) {
      return drawLeaderLine(d)
    });

  })
  .on("dragend", function() {
    console.log("event " + item_index + " annotation resized to " + label_width + "px");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "event " + item_index + " annotation resized to " + label_width + "px"
    }
    usage_log.push(log_event);
  });

  leader_line_path = [
    {x:x_pos, y:y_pos},
    {x:x_pos, y:y_pos + y_anno_offset + 18},
    {x:x_pos + x_anno_offset + label_width, y:y_pos + y_anno_offset + 18}
  ]

  event_annotation.append("path")
  .attr("d", drawLeaderLine(leader_line_path))
  .attr("class","annotation_line")

  var annotation_frame = event_annotation.append("rect")
  .attr("class","annotation_frame")
  .attr("x", x_pos + x_anno_offset)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",label_width + 7.5)
  // .attr("filter", "url(#drop-shadow)");

  event_annotation.append("svg:image")
  .attr("class","annotation_control frame_resizer")
  .attr('title','resize label')
  .attr("x", x_pos + x_anno_offset + label_width + 7.5)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",20)
  .attr("height",20)
  .attr("xlink:href","/img/expand.png")
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0);

  var annotation_resizer = event_annotation.append("rect")
  .attr("class","annotation_control frame_resizer")
  .attr("x", x_pos + x_anno_offset + label_width + 7.5)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",20)
  .attr("height",20)
  .style("opacity",0)
  .on('mouseover', function(){
    d3.select(this).style('stroke','#f00')
  })
  .on('mouseout', function(){
    d3.select(this).style('stroke','#ccc')
  })
  .call(resize);

  annotation_resizer.append('title')
  .text('Resize label');

  event_annotation.append("svg:image")
  .attr("class","annotation_control annotation_delete")
  .attr("id","annotation_delete")
  .attr('title','remove label')
  .attr("x", x_pos + x_anno_offset + label_width + 7.5 + 20)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",20)
  .attr("height",20)
  .attr("xlink:href","/img/delete.png")
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0);

  event_annotation.append("rect")
  .attr("class","annotation_control annotation_delete")
  .attr("x", x_pos + x_anno_offset + label_width + 7.5 + 20)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",20)
  .attr("height",20)
  .style("opacity",0)
  .on('mouseover', function(){
    d3.select(this).style('stroke','#f00')
  })
  .on('mouseout', function(){
    d3.select(this).style('stroke','#ccc')
  })
  .on('click', function(){
    var corresponding_event = d3.select("#event_g" + item_index);

    console.log("event " + item_index + " annotation removed");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "event " + item_index + " annotation removed"
    }
    usage_log.push(log_event);

    corresponding_event[0][0].__data__.selected = false;

    //highlighting not used in Priestley style

    corresponding_event.selectAll(".event_span")
    .attr("filter", "none")
    .style("stroke","#333")
    .style("stroke-width","0.25px");

    corresponding_event.selectAll(".event_span_component")
    .style("stroke","#333")
    .style("stroke-width","0.25px");

    d3.select(this.parentNode).remove();
  })
  .append('title')
  .text('Remove label');

  event_annotation.append("circle")
  .attr("class","annotation_circle")
  .attr("cx", x_pos)
  .attr("cy", y_pos)
  .attr("r", 2.5);

  var event_label_text = event_annotation.append("text")
  .attr("class","event_label")
  .attr("x", x_pos + x_anno_offset + 7.5)
  .attr("y", y_pos + y_anno_offset + annotation_buffer)
  .attr("dy",0)
  .text(content_text)
  .call(wrap,label_width - 7.5);

  var annotation_drag_area = event_annotation.append("rect")
  .attr("class","annotation_drag_area")
  .attr("x", x_pos + x_anno_offset)
  .attr("y", y_pos + y_anno_offset)
  .attr("width",label_width + 7.5)
  .on("click", function () {

  })
  .call(drag);

  event_label_text.attr("dy",1 + "em")
  .text(content_text)
  .call(wrap, label_width - 7.5);

  //word wrapping function from http://bl.ocks.org/mbostock/7555321
  function wrap(text, width) {
    var words = text.text().split(/\s+/).reverse(),
    word,
    line = [],
    line_number = 0,
    dy = parseFloat(text.attr("dy")),
    tspan = text.text(null).append("tspan")
    .attr("dy",dy + "em")
    .attr("x", x_pos + x_anno_offset + 7.5)
    .attr("y", y_pos + y_anno_offset + annotation_buffer);
    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan")
        .attr("x", x_pos + x_anno_offset + 7.5)
        .attr("y", y_pos + y_anno_offset + annotation_buffer)
        .attr("dy", ++line_number + dy + "em").text(word);
      }
    }
    annotation_frame.attr("height",((line_number + 3) * 12) + "px");
    if (annotation_drag_area != undefined) {
      annotation_drag_area.attr("height",((line_number + 3) * 12) + "px");
    }
  };

  return true;

};
