/**

addCaption: //on-demand captions for a timeline

**/

addCaption = function (caption,caption_width,x_rel_pos,y_rel_pos,caption_index) {

  "use strict";

  var x_pos = x_rel_pos * width,
  y_pos = y_rel_pos * height;

  var min_caption_width = caption_width;

  var timeline_caption = d3.select('#main_svg').append("g")
  .attr("id","caption" + caption_index)
  .attr("class","timeline_caption");

  timeline_caption.on("mouseover", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(500)
    .style("opacity",1);
    d3.select(this).select(".caption_frame")
    .transition()
    .duration(500)
    .style("stroke","#999")
    .attr("filter", "url(#drop-shadow)");
  })
  .on("mouseout", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(500)
    .style("opacity",0);
    d3.select(this).select(".caption_frame")
    .transition()
    .duration(500)
    .style("stroke","none")
    .attr("filter", "none");
  });

  timeline_caption.append("title")
  .text("double click to remove caption.");

  var drag = d3.behavior.drag()
  .origin(function () {
    var t = d3.select(this);

    return {
      x: t.attr("x"),
      y: t.attr("y")
    };
  })
  .on("drag", function () {

    x_pos = d3.event.x;
    y_pos = d3.event.y;

    var i = 0;

    while (caption_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    caption_list[i].x_rel_pos = x_pos / width;
    caption_list[i].y_rel_pos = y_pos / height;

    d3.select(this)
    .attr('x', x_pos)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_frame")
    .attr('x', x_pos)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_label").selectAll("tspan")
    .attr('x', x_pos + 7.5)
    .attr('y', y_pos + unit_width);

    d3.select(this.parentNode).select(".frame_resizer")
    .attr('x', x_pos + caption_width + unit_width)
    .attr('y', y_pos);

    d3.select(this.parentNode).select("#caption_delete")
    .attr('x', x_pos + caption_width + unit_width + 10)
    .attr('y', y_pos);
  })
  .on("dragend", function() {
    console.log("caption " + caption_index + " moved to [" + x_pos + "," + y_pos + "]");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "caption " + caption_index + " moved to [" + x_pos + "," + y_pos + "]"
    }
    usage_log.push(log_event);
  });

  var resize = d3.behavior.drag()
  .origin(function () {

    var t = d3.select(this);
    y_pos = +t.attr("y");

    return {
      x: t.attr("x"),
      y: t.attr("y")
    };
  })
  .on("drag", function () {
    d3.select(this).attr('x', d3.max([x_pos + caption_width + unit_width, x_pos + unit_width + (d3.event.x - x_pos)]));

    caption_width = d3.max([min_caption_width,d3.event.x - x_pos]);

    var i = 0;

    while (caption_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    caption_list[i].caption_width = caption_width;

    d3.select(this.parentNode).select(".caption_frame")
    .attr("width", caption_width + 7.5);

    d3.select(this.parentNode).select("#caption_delete")
    .attr('x', x_pos + caption_width + unit_width + 10)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_drag_area")
    .attr("width", caption_width + 7.5);

    d3.select(this.parentNode).select(".caption_label")
    .attr("x", x_pos + 7.5)
    .attr("y", y_pos + unit_width)
    .text(caption)
    .call(wrap, caption_width - 7.5);
  })
  .on("dragend", function() {
    console.log("caption " + caption_index + " resized to " + caption_width + "px");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "caption " + caption_index + " resized to " + caption_width + "px"
    }
    usage_log.push(log_event);
  });

  var caption_frame = timeline_caption.append("rect")
  .attr("class","caption_frame")
  .attr("x", x_pos)
  .attr("y", y_pos)
  .attr("width",caption_width + 7.5);
  // .attr("filter", "url(#drop-shadow)");

  timeline_caption.append("svg:image")
  .attr("class","annotation_control frame_resizer")
  .attr('title','resize caption')
  .attr("x", x_pos + caption_width + unit_width)
  .attr("y", y_pos)
  .attr("width",10)
  .attr("height",10)
  .attr("xlink:href","/img/expand.png")
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0)
  .call(resize);

  timeline_caption.append("svg:image")
  .attr("class","annotation_control annotation_delete")
  .attr("id","caption_delete")
  .attr('title','remove caption')
  .attr("x", x_pos + caption_width + unit_width + 10)
  .attr("y", y_pos)
  .attr("width",10)
  .attr("height",10)
  .attr("xlink:href","/img/delete.png")
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0)
  .on('click', function(){

    console.log("caption " + caption_index + " removed");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "caption " + caption_index + " removed"
    }
    usage_log.push(log_event);

    d3.select(this.parentNode).remove();
  });

  var caption_label = timeline_caption.append("text")
  .attr("class","caption_label")
  .attr("x", x_pos + 7.5)
  .attr("y", y_pos + unit_width)
  .attr("dy",1)
  .text(caption)
  .call(wrap,caption_width - 7.5);

  var caption_drag_area = timeline_caption.append("rect")
  .attr("class","caption_drag_area")
  .attr("x", x_pos)
  .attr("y", y_pos)
  .attr("width",caption_width + 7.5)
  .on("dblclick", function () {

    console.log("caption " + caption_index + " removed");

    var log_event = {
      event_time: new Date().valueOf(),
      event_category: "annotation",
      event_detail: "caption " + caption_index + " removed"
    }
    usage_log.push(log_event);

    d3.select(this.parentNode).remove();
  })
  .call(drag);

  caption_label.attr("dy",1 + "em")
  .text(caption)
  .call(wrap, caption_width - 7.5);

  //word wrapping function from http://bl.ocks.org/mbostock/7555321
  function wrap(text, width) {
    var words = text.text().split(/\s+/).reverse(),
    word,
    line = [],
    line_number = 0,
    dy = parseFloat(text.attr("dy")),
    tspan = text.text(null).append("tspan")
    .attr("dy",dy + "em")
    .attr("x", x_pos + 7.5)
    .attr("y", y_pos + unit_width);
    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan")
        .attr("x", x_pos + 7.5)
        .attr("y", y_pos + unit_width)
        .attr("dy", ++line_number + dy + "em").text(word);
      }
    }
    caption_frame.attr("height",((line_number + 2.5) * 18) + "px"); //24, not 18 in Priestley style
    if (caption_drag_area != undefined) {
      caption_drag_area.attr("height",((line_number + 2.5) * 18) + "px"); //24, not 18 in Priestley style
    }
  };

  return true;

};
