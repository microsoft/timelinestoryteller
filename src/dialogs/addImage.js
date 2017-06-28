const template = require("../templates/addImagePopup.html");
const d3 = require("d3");
const imageUrls = require("../imageUrls");

/**
 * An add image dialog
 * @constructor
 */
function AddImageDialog() {
  this.element = d3.select(template());
  this._dispatcher = d3.dispatch("imageSelected");
  this.on = this._dispatcher.on.bind(this._dispatcher);
  this._addImageUrl = this.element.select(".add_image_link");
  this._addImageButton = this.element.select(".add_image_btn");
  this._addImageDropZone = this.element.select(".image_local_add_drop_zone");
  this._addImageFileChooser = this.element.select(".add_image_file_chooser");
  this._addFilesContainer = this.element.select(".file_selection_container");
  this._selectedFilesContainer = this.element.select(".selected_files_container");
  this._selectedFiles = [];

  this._addImageButton.on("click", this._addImageButtonClicked.bind(this));
  this._addImageDropZone
    .on("dragover", this._addImageDropZoneDragOver.bind(this))
    .on("drop", this._addImageDropZoneDrop.bind(this))
    .on("dragleave", this._addImageDropZoneDragLeave.bind(this));
  this._addImageFileChooser.on("change", this._addImageFileChooserChange.bind(this));
}

/**
 * Shows the add image dialog
 * @returns {void}
 */
AddImageDialog.prototype.show = function () {
  this.element.style("display", "");
};

/**
 * Hides the add image dialog
 * @returns {void}
 */
AddImageDialog.prototype.hide = function () {
  this.element.style("display", "none");
};

/**
 * Returns true if the image dialog is hidden
 * @returns {boolean} true if hidden
 */
AddImageDialog.prototype.hidden = function () {
  return this.element.style("display") === "none";
};

/**
 * Resets the dialog to the default state
 * @param {boolean} [hide=true] If the dialog should be hidden
 * @returns {void}
 */
AddImageDialog.prototype.reset = function (hide) {
  this._selectedFiles.length = 0;
  this._addImageUrl.attr("value", "");
  this._addImageFileChooser.node().value = "";
  this._addFilesContainer.style("display", "");
  this._selectedFilesContainer
    .style("display", "none")
    .html("No files selected");
  if (hide !== false) {
    this.hide();
  }
};

/**
 * Adds a selected file to the list of selected files
 * @param {File} file The file that was selected
 * @returns {void}
 */
AddImageDialog.prototype._addSelectedFile = function (file) {
  this._selectedFiles.push(file);
  const fileContainer = this._selectedFilesContainer
    .html("")
    .append("div")
      .attr("role", "button")
      .attr("tabIndex", 0)
      .attr("class", "add_image_selected_file");
  fileContainer
    .append("span")
      .text(file.name);
  fileContainer
    .append("img")
      .attr("class", "selected_file_remove_btn")
      .attr("src", imageUrls("close.png"));
  fileContainer.on("click", () => {
    this.reset(false);
  });
  this._addFilesContainer.style("display", "none");
  this._selectedFilesContainer.style("display", "");
};

/**
 * Listener for the Add image button being clicked
 * @returns {void}
 */
AddImageDialog.prototype._addImageButtonClicked = function () {
  const imageUrl = this._addImageUrl.attr("value");
  if (this._selectedFiles.length) {
    const fileReader = new FileReader();
    const that = this;
    fileReader.onloadend = function (fileEvent) {
      const dataURI = fileEvent.target.result;
      // convert base64/URLEncoded data component to raw binary data held in a string
      const dataURIParts = dataURI.split(",");
      const byteString = dataURIParts[0].indexOf("base64") >= 0 ? atob(dataURIParts[1]) : decodeURIComponent(dataURIParts[1]);

      // separate out the mime component
      const type = dataURIParts[0].split(":")[1].split(";")[0];

      // write the bytes of the string to a typed array
      const ia = new Uint8Array(byteString.length);
      for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }

      const blob = new Blob([ia], { type });
      that._dispatcher.imageSelected(URL.createObjectURL(blob));
    };
    fileReader.readAsDataURL(this._selectedFiles[0]);
  } else if (imageUrl) {
    this._dispatcher.imageSelected(imageUrl);
  }
  this.reset();
};

/**
 * Drag over listener for the drag/drop zone for files
 * @returns {void}
 */
AddImageDialog.prototype._addImageDropZoneDragOver = function () {
  const e = d3.event;
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  this._addImageDropZone.classed("dragging", true);
};

/**
 * Drag over listener for the drag/drop zone for files
 * @returns {void}
 */
AddImageDialog.prototype._addImageDropZoneDragLeave = function () {
  const e = d3.event;
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  this._addImageDropZone.classed("dragging", false);
};

/**
 * Drop listener for the drag/drop zone for files
 * @returns {void}
 */
AddImageDialog.prototype._addImageDropZoneDrop = function () {
  const e = d3.event;
  e.stopPropagation();
  e.preventDefault();

  const files = e.dataTransfer.files;
  this._addSelectedFile(files[0]);
};

/**
 * Listener for when the file chooser changes
 * @returns {void}
 */
AddImageDialog.prototype._addImageFileChooserChange = function () {
  this._addSelectedFile(this._addImageFileChooser.node().files[0]);
};

module.exports = function () {
  return new AddImageDialog();
};
