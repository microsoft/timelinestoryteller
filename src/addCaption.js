/**

addCaption: //on-demand captions for a timeline

**/

var imageUrls = require("./imageUrls");
var d3 = require("d3");
var globals = require("./globals");

var utils = require("./utils");
var logEvent = utils.logEvent;
var selectWithParent = utils.selectWithParent;

module.exports = function (caption,caption_width,x_rel_pos,y_rel_pos,caption_index) {

  "use strict";

  var x_pos = x_rel_pos * globals.width,
  y_pos = y_rel_pos * globals.height;

  var min_caption_width = caption_width;

  var timeline_caption = selectWithParent('#main_svg').append("g")
  .attr("id","caption" + caption_index)
  .attr("class","timeline_caption");

  timeline_caption.on("mouseover", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(250)
    .style("opacity",1);
    d3.select(this).select(".caption_frame")
    .transition()
    .duration(250)
    .style("stroke","#999")
    .attr("filter", "url(#drop-shadow)");
  })
  .on("mouseout", function () {
    d3.select(this).selectAll(".annotation_control")
    .transition()
    .duration(250)
    .style("opacity",0);
    d3.select(this).select(".caption_frame")
    .transition()
    .duration(250)
    .style("stroke","white")
    .attr("filter", "none");
  });

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

    while (globals.caption_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    globals.caption_list[i].x_rel_pos = x_pos / globals.width;
    globals.caption_list[i].y_rel_pos = y_pos / globals.height;

    d3.select(this)
    .attr('x', x_pos)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_frame")
    .attr('x', x_pos)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_label").selectAll("tspan")
    .attr('x', x_pos + 7.5)
    .attr('y', y_pos + globals.unit_width);

    d3.select(this.parentNode).selectAll(".frame_resizer")
    .attr('x', x_pos + caption_width + 7.5)
    .attr('y', y_pos);

    d3.select(this.parentNode).selectAll(".annotation_delete")
    .attr('x', x_pos + caption_width + 7.5 + 20)
    .attr('y', y_pos);
  })
  .on("dragend", function() {
    logEvent("caption " + caption_index + " moved to [" + x_pos + "," + y_pos + "]");
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
    d3.select(this).attr('x', d3.max([x_pos + caption_width + 7.5, x_pos + 7.5 + (d3.event.x - x_pos)]));

    caption_width = d3.max([min_caption_width,d3.event.x - x_pos]);

    var i = 0;

    while (globals.caption_list[i].id != d3.select(this.parentNode).attr('id')){
      i++;
    }
    globals.caption_list[i].caption_width = caption_width;

    d3.select(this.parentNode).selectAll(".frame_resizer")
    .attr('x', x_pos + caption_width + 7.5)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_frame")
    .attr("width", caption_width + 7.5);

    d3.select(this.parentNode).selectAll(".annotation_delete")
    .attr('x', x_pos + caption_width + 7.5 + 20)
    .attr('y', y_pos);

    d3.select(this.parentNode).select(".caption_drag_area")
    .attr("width", caption_width + 7.5);

    d3.select(this.parentNode).select(".caption_label")
    .attr("x", x_pos + 7.5)
    .attr("y", y_pos + globals.unit_width)
    .text(caption)
    .call(wrap, caption_width - 7.5);
  })
  .on("dragend", function() {
    logEvent("caption " + caption_index + " resized to " + caption_width + "px");
  });

  var caption_frame = timeline_caption.append("rect")
  .attr("class","caption_frame")
  .attr("x", x_pos)
  .attr("y", y_pos)
  .attr("width",caption_width + 7.5);

  timeline_caption.append("svg:image")
  .attr("class","annotation_control frame_resizer")
  .attr('title','resize caption')
  .attr("x", x_pos + caption_width + 7.5)
  .attr("y", y_pos)
  .attr("width",20)
  .attr("height",20)
  .attr("xlink:href",imageUrls("expand.png", true))
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0);

  var caption_resizer = timeline_caption.append("rect")
  .attr("class","annotation_control frame_resizer")
  .attr("x", x_pos + caption_width + 7.5)
  .attr("y", y_pos)
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

  caption_resizer.append('title')
  .text('Resize caption');

  timeline_caption.append("svg:image")
  .attr("class","annotation_control annotation_delete")
  .attr('title','remove caption')
  .attr("x", x_pos + caption_width + 7.5 + 20)
  .attr("y", y_pos)
  .attr("width",20)
  .attr("height",20)
  .attr("xlink:href",imageUrls("delete.png", true))
  .attr("filter", "url(#drop-shadow)")
  .style("opacity",0);

  timeline_caption.append("rect")
  .attr("class","annotation_control annotation_delete")
  .attr("x", x_pos + caption_width + 7.5 + 20)
  .attr("y", y_pos)
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
    logEvent("caption " + caption_index + " removed");

    d3.select(this.parentNode).remove();
  })
  .append('title')
  .text('Remove caption');

  var caption_label = timeline_caption.append("text")
  .attr("class","caption_label")
  .attr("x", x_pos + 7.5)
  .attr("y", y_pos + globals.unit_width)
  .attr("dy",1)
  .text(caption)
  .call(wrap,caption_width - 7.5);

  var caption_drag_area = timeline_caption.append("rect")
  .attr("class","caption_drag_area")
  .attr("x", x_pos)
  .attr("y", y_pos)
  .attr("width",caption_width + 7.5)
  .call(drag);

  caption_label.attr("dy",1 + "em")
  .text(caption)
  .call(wrap, caption_width - 7.5);

  function wrap(text, width) {
    var words = text.text().split(/\s+/).reverse(),
    word,
    line = [],
    line_number = 0,
    dy = parseFloat(text.attr("dy")),
    tspan = text.text(null).append("tspan")
    .attr("dy",dy + "em")
    .attr("x", x_pos + 7.5)
    .attr("y", y_pos + globals.unit_width);
    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan")
        .attr("x", x_pos + 7.5)
        .attr("y", y_pos + globals.unit_width)
        .attr("dy", ++line_number + dy + "em").text(word);
      }
    }
    caption_frame.attr("height",((line_number + 2.5) * 18) + "px");
    if (caption_drag_area != undefined) {
      caption_drag_area.attr("height",((line_number + 2.5) * 18) + "px");
    }
  };

  return true;

};
