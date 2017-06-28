var toElement = require("./toElement");

/**
 * Template for the add image popup
 * @returns {HTMLElement} The add image popup element
 */
module.exports = () => toElement(`
  <div id="image_div" class="annotation_div control_div" style="display:none">
    <div class="image_div_container">
      <div class="image_url_add_container">
        <h5>Add from image URL</h5>
        <input type="text" placeholder="Image URL" class="text_input add_image_link">
      </div>
      <div class="image_local_add_container">
        <hr/>
        <h5>Add from your computer</h5>
        <div class="file_selection_container">
          <div class="image_local_add_drop_zone">Drop files here</div>
          <h6>OR</h6>
          <input type="file" class="add_image_file_chooser" accept=".jpg,.jpeg,.png,.gif,.tiff">
        </div>
        <div class="selected_files_container" style="display:none">
          No files selected
        </div>
      </div>
      <div>
        <button class="add_image_btn" title="Add Image">OK</button>
      </div>
    </div>
  </div>
`);
