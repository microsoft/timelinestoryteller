const toElement = require("./toElement");

/**
 * Template for the add image popup
 * @returns {HTMLElement} The add image popup element
 */
module.exports = () => toElement(`
  <div id="image_div" class="add_image_popup annotation_div control_div" style="display:none">
    <div class="image_div_container">
      <div class="image_div_error" style="display:none"></div>
      <div class="image_url_add_container">
        <h4>Add from image URL</h4>
        <input type="text" placeholder="Image URL" class="text_input add_image_link">
        <div class="offline_option_container">
          <label title="If true, this will allow for offline playback.">
            Keep Offline?
            <input type="checkbox" class="offline_enabled_cb" checked>
          </label>
        </div>
      </div>
      <div class="image_local_add_container">
        <hr/>
        <h4>Add from your computer</h4>
        <div class="file_selection_container">
          <div class="image_local_add_drop_zone">Drop files here</div>
          <h5>OR</h5>
          <input type="file" class="add_image_file_chooser" accept=".jpg,.jpeg,.png,.gif">
        </div>
        <div class="selected_files_container" style="display:none">
          No files selected
        </div>
      </div>
      <div class="options_container">
        <hr/>
        <h4>Options</h4>
        <div class="resize_options">
          <label title="Smaller images should be preferred as larger images increase the final size of the story, this will automatically resize your images to the given size">
            <input class="resize_enabled_cb" type="checkbox" checked>
            <span>Resize To:&nbsp;</span>
          </label>
          <input type="number" class="resize_width" placeholder="Width" value=400>
          x
          <input type="number" class="resize_height" placeholder="Height" value=400>
        </div>
      </div>
      <div>
        <button class="add_image_btn" title="Add Image">OK</button>
      </div>
    </div>
  </div>
`);
