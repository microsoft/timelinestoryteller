require("../assets/css/lib/colorpicker.css");

require("./lib/colorpicker");
var ColorPicker = window.ColorPicker;

module.exports = function shim(parentEle) {
  var isIE11 = !!window.MSInputMethodContext && !!document.documentMode;
  if (isIE11) {
    function colorify(node) {
      if (node.nodeName.toLowerCase() === "input" && node.getAttribute("type") === "color") {
        function setupStyles() {
          var computedStyle = window.getComputedStyle(node);
          colorPickerContainer.setAttribute("style", node.getAttribute("style"));
          if (!computedStyle.getPropertyValue("width")) {
            colorPickerContainer.style.width = "20px";
          }
          if (!computedStyle.getPropertyValue("height")) {
            colorPickerContainer.style.height = "20px";
          }

          colorPickerContainer.className = node.className;

          // node.setAttribute("type", "text");

          // Hide the old input node
          node.style.display = "none";
        }
        var initialValue = node.getAttribute("value") || "#000000";

        var colorPickerContainer = document.createElement("div");

        var colorPickerDiv = document.createElement("div");
        colorPickerDiv.style.width = "100%";
        colorPickerDiv.style.height = "100%";
        colorPickerDiv.style.position = "relative";
        setupStyles();

        var colorSwatch = document.createElement("div");
        colorSwatch.style.backgroundColor = initialValue;
        colorSwatch.style.width = "100%";
        colorSwatch.style.height = "100%";

        colorPickerDiv.appendChild(colorSwatch);
        colorPickerContainer.appendChild(colorPickerDiv);

        var colorPickerPopupDiv = document.createElement("div");
        colorPickerPopupDiv.className = "cp-small";
        colorPickerPopupDiv.style.width = "120px";
        colorPickerPopupDiv.style.height = "115px";
        colorPickerPopupDiv.style.display = "none";
        colorPickerPopupDiv.style.position = "absolute";
        colorPickerPopupDiv.style.top = "100%";
        colorPickerPopupDiv.style.left = "100%";
        colorPickerPopupDiv.style.outline = "none";
        colorPickerPopupDiv.style.zIndex = 10000000000;

        document.body.appendChild(colorPickerPopupDiv);
        /* colorPickerPopupDiv.setAttribute("tabIndex", 0);
        colorPickerPopupDiv.addEventListener("blur", function() {
        	var active = document.activeElement;
          if (!colorPickerPopupDiv.contains(active)) {
        		closePopup();
          }
        });*/

        var oldValue;
        var newValue;
        var cp = ColorPicker(colorPickerPopupDiv, function (hex) {
          newValue = hex;
        });
        cp.setHex(initialValue);

        function dispatchOnChanged() {
          if ("createEvent" in document) {
            var evt = document.createEvent("HTMLEvents");
            evt.initEvent("change", false, true);
            node.dispatchEvent(evt);
          } else {
            node.fireEvent("onchange");
          }
        }

        function closePopup(color) {
          node.setAttribute("value", color);
          dispatchOnChanged();
          colorPickerPopupDiv.style.display = "none";
          // colorPickerPopupDiv.blur();
        }

        function showPopup() {
          colorPickerPopupDiv.style.display = "block";
          var rect = colorPickerDiv.getBoundingClientRect();
          colorPickerPopupDiv.style.left = rect.right + "px";
          colorPickerPopupDiv.style.top = rect.bottom + "px";
        }

        var okButton = document.createElement("button");
        okButton.innerHTML = "OK";
        okButton.addEventListener("click", function (e) {
          closePopup(newValue);
          e.stopPropagation();
        });

        var cancelButton = document.createElement("button");
        cancelButton.innerHTML = "Cancel";
        cancelButton.addEventListener("click", function (e) {
          closePopup(oldValue);
          e.stopPropagation();
        });

        colorPickerPopupDiv.appendChild(okButton);
        colorPickerPopupDiv.appendChild(cancelButton);

        // colorPickerDiv.appendChild(colorPickerPopupDiv);

        colorSwatch.addEventListener("click", function () {
          oldValue = node.value;
          cp.setHex(node.value);
          showPopup();
        });

        node.parentNode.insertBefore(colorPickerContainer, node);
        node.addEventListener("change", function () {
          cp.setHex(this.value);
        });

        var attrObserver = new MutationObserver(function (attrRecords) {
          for (var k = 0; k < attrRecords.length; k++) {
            var attr = attrRecords[k].attributeName;
            if (attr === "value") {
              colorSwatch.style.backgroundColor = node.value;
            } else if (attr === "style" || attr === "class") {
              setupStyles();
            }
          }
        });
        attrObserver.observe(node, {
          attributes: true
        });
      }
    }

    var inputNodes = parentEle.querySelectorAll("input[type=\"color\"]");

    for (var i = 0; i < inputNodes.length; i++) {
      colorify(inputNodes[i]);
    }

    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var addedNodes = records[i].addedNodes;
        for (var j = 0; j < addedNodes.length; j++) {
          colorify(addedNodes[j]);
        }
      }
    });
    observer.observe(parentEle, {
      childList: true,
      subtree: true
    });
  }
};
