/**

addImage: //on-demand image for a timeline

**/

var imageUrls = require("./imageUrls");
var d3 = require("d3");
var globals = require("./globals");
var utils = require("./utils");
var logEvent = utils.logEvent;
var selectWithParent = utils.selectWithParent;
var nextId = utils.nextId;

module.exports = function (timeline_vis, image_url, x_rel_pos, y_rel_pos, image_width, image_height, image_index) {
  "use strict";

  var x_pos = x_rel_pos * globals.width,
    y_pos = y_rel_pos * globals.height;

  var orig_image_weight = image_width,
    orig_image_height = image_height,
    min_image_width = 10;

  var scaling_ratio = 1;

  var timeline_image = selectWithParent("#main_svg").append("g")
    .attr("id", "image" + image_index)
    .attr("class", "timeline_image");

  d3.selection.prototype.moveToBack = function () {
    return this.each(function () {
      var firstChild = this.parentNode.firstChild;
      if (firstChild) {
        this.parentNode.insertBefore(this, firstChild);
      }
    });
  };

  d3.selection.prototype.moveToFront = function () {
    return this.each(function () {
      this.parentNode.appendChild(this);
    });
  };

  timeline_image.on("click", function () {
    if (d3.event.shiftKey)      {
      d3.select(this)
        .style("opacity", 0.3)
        .moveToBack();
    }
    if (d3.event.ctrlKey)      {
      d3.select(this)
        .style("opacity", 1)
        .moveToFront();
    }
  })
    .on("mouseover", function () {
      d3.select(this).selectAll(".annotation_control")
        .transition()
        .duration(250)
        .style("opacity", 1);
      d3.select(this).select(".image_frame")
        .transition()
        .duration(250)
        .style("stroke", "#999")
        .attr("filter", "url(#drop-shadow)");
    })
    .on("mouseout", function () {
      d3.select(this).selectAll(".annotation_control")
        .transition()
        .duration(250)
        .style("opacity", 0);
      d3.select(this).select(".image_frame")
        .transition()
        .duration(250)
        .style("stroke", "none")
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

      while (globals.image_list[i].id !== d3.select(this.parentNode).attr("id")) {
        i++;
      }
      globals.image_list[i].x_rel_pos = x_pos / globals.width;
      globals.image_list[i].y_rel_pos = y_pos / globals.height;

      d3.select(this)
        .attr("x", x_pos)
        .attr("y", y_pos);

      d3.select(this.parentNode).select("clipPath").select("circle")
        .attr("cx", x_pos + image_width / 2)
        .attr("cy", y_pos + (image_height * scaling_ratio) / 2)
        .attr("r", image_width / 2);

      d3.select(this.parentNode).select(".image_frame")
        .attr("x", x_pos)
        .attr("y", y_pos);

      d3.select(this.parentNode).selectAll(".frame_resizer")
        .attr("x", x_pos + image_width)
        .attr("y", y_pos);

      d3.select(this.parentNode).selectAll(".annotation_delete")
        .attr("x", x_pos + image_width + 20)
        .attr("y", y_pos);
    })
    .on("dragend", function () {
      logEvent("image " + image_index + " moved to [" + x_pos + "," + y_pos + "]");
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
      var prev_image_width = d3.select(this.parentNode).select(".image_frame").attr("width"),
        prev_image_height = d3.select(this.parentNode).select(".image_frame").attr("height");

      d3.select(this).attr("x", d3.max([x_pos + image_width, x_pos + (d3.event.x - x_pos)]));

      image_width = d3.max([min_image_width, d3.event.x - x_pos]);

      scaling_ratio = image_width / orig_image_weight;

      var i = 0;

      while (globals.image_list[i].id !== d3.select(this.parentNode).attr("id")) {
        i++;
      }
      globals.image_list[i].i_width = image_width;
      globals.image_list[i].i_height = image_height * scaling_ratio;

      d3.select(this.parentNode).select("clipPath").select("circle")
        .attr("cx", x_pos + image_width / 2)
        .attr("cy", y_pos + (image_height * scaling_ratio) / 2)
        .attr("r", image_width / 2);

      d3.select(this.parentNode).select(".image_frame")
        .attr("width", image_width)
        .attr("height", image_height * scaling_ratio);

      d3.select(this.parentNode).selectAll(".frame_resizer")
        .attr("x", x_pos + image_width)
        .attr("y", y_pos);

      d3.select(this.parentNode).selectAll(".annotation_delete")
        .attr("x", x_pos + image_width + 20)
        .attr("y", y_pos);

      d3.select(this.parentNode).select(".image_drag_area")
        .attr("width", image_width)
        .attr("height", image_height * scaling_ratio);
    })
    .on("dragend", function () {
      logEvent("image " + image_index + " resized to " + image_width + "px");
    });

  var image_defs = timeline_image.append("defs");

  var clipPathId = nextId();
  var circle_clip_path = image_defs.append("clipPath")
    .attr("id", "circlepath" + clipPathId)
    .attr("class", "image-clip-path")
    .append("circle")
    .attr("cx", x_pos + image_width / 2)
    .attr("cy", y_pos + image_height / 2)
    .attr("r", image_width / 2);

  var image_frame = timeline_image.append("svg:image")
    .attr("xlink:href", image_url)
    .attr("class", "image_frame")
    .attr("clip-path", function () {
      if (timeline_vis.tl_representation() === "Radial") {
        return "url(#circlepath" + clipPathId + ")";
      }

      return "none";
    })
    .style("clip-path", function () {
      if (timeline_vis.tl_representation() === "Radial") {
        return "circle()";
      }

      return "none";
    })
    .style("-webkit-clip-path", function () {
      if (timeline_vis.tl_representation() === "Radial") {
        return "circle()";
      }

      return "none";
    })
    .attr("x", x_pos)
    .attr("y", y_pos)
    .attr("width", image_width)
    .attr("height", image_height);

  timeline_image.append("svg:image")
    .attr("class", "annotation_control frame_resizer")
    .attr("title", "resize image")
    .attr("x", x_pos + image_width)
    .attr("y", y_pos)
    .attr("width", 20)
    .attr("height", 20)
    .attr("xlink:href", imageUrls("expand.png"))
    .attr("filter", "url(#drop-shadow)")
    .style("opacity", 0);

  var image_resizer = timeline_image.append("rect")
    .attr("class", "annotation_control frame_resizer")
    .attr("x", x_pos + image_width)
    .attr("y", y_pos)
    .attr("width", 20)
    .attr("height", 20)
    .style("opacity", 0)
    .on("mouseover", function () {
      d3.select(this).style("stroke", "#f00");
    })
    .on("mouseout", function () {
      d3.select(this).style("stroke", "#ccc");
    })
    .call(resize);

  image_resizer.append("title")
    .text("Resize image");

  timeline_image.append("svg:image")
    .attr("class", "annotation_control annotation_delete")
    .attr("title", "remove image")
    .attr("x", x_pos + image_width + 20)
    .attr("y", y_pos)
    .attr("width", 20)
    .attr("height", 20)
    .attr("xlink:href", imageUrls("delete.png"))
    .attr("filter", "url(#drop-shadow)")
    .style("opacity", 0);

  timeline_image.append("rect")
    .attr("class", "annotation_control annotation_delete")
    .attr("x", x_pos + image_width + 20)
    .attr("y", y_pos)
    .attr("width", 20)
    .attr("height", 20)
    .style("opacity", 0)
    .on("mouseover", function () {
      d3.select(this).style("stroke", "#f00");
    })
    .on("mouseout", function () {
      d3.select(this).style("stroke", "#ccc");
    })
    .on("click", function () {
      logEvent("image " + image_index + " removed");

      d3.select(this.parentNode).remove();
    })
    .append("title")
    .text("Remove image");

  var image_drag_area = timeline_image.append("rect")
    .attr("class", "image_drag_area")
    .attr("x", x_pos)
    .attr("y", y_pos)
    .attr("width", image_width)
    .attr("height", image_width)
    .call(drag);

  return true;
};
