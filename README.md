# Timeline Storyteller

An expressive visual storytelling environment for the expressive narrative visualization of timelines (event sequence data); a storyteller can use Timeline Storyteller to present different aspects of her/his data using a palette of timeline representations, scales, and layouts, as well as controls for filtering, highlighting, and annotation. She / he can export images of a timeline or assemble and record a story about their data and present it within the application.

For more information on the research that informed this project, see [timelinesrevisited.github.io](https://timelinesrevisited.github.io/).

## Setup

1. Clone the main branch of this repository.

2. Install [nodejs](https://nodejs.org/).

3. Navigate to the parent directory of the repository.

4. Install the socket.io node module: `npm install socket.io`

4. Start the node server: `node server.js`

5. Open [localhost:8080](http://localhost:8080/)

## Usage

1. Load timeline data (demo dataset, JSON, CSV, Google Spreadsheet) or saved timeline story (a JSON Blob with extension .cdc; see step 6)

2. Select representation, scale, and layout

3. Edit the canvas

	* Click on events to annotate with their `content_text` label; resize and reposition labels; SHIFT + click to highlight events without showing label

	* Annotate with captions and images; resize and reposition captions and images

 	* Filter events by category, facet, or segment. Filter by highlighting emphasizing matching events (de-emphasizing non-matching events), or by hiding non-matching events

4. Record current canvas as a scene, which retains labels, captions, and images. Enter playback mode, navigate to previous / next recorded scene

5. Export current canvas as a PNG, SVG.

6. Export the scenes as an animated GIF or as a JSON Blob (.cdc extension)

## Data format

Event datasets in CSV, JSON, or Google Spreadsheets are currently supported.

Each event is specified by the following attributes:

- __Required__: `start_date`, date: YYYY, YYYY-MM-DD, or YYYY-MM-DD HH:MMZ formats are supported (Z necessary for specifying UTC, otherwise HH:MM will be time-zone dependent). BC dates are permitted, e.g., -27, -13800000000
- __Optional__: `end_date`, date: using same format as `start_date`
- __Optional__: `category`, string (category attribute 1)
- __Optional__: `facet`, string (categorical attribute 2; this can be identical to `category`)
- __Optional__: `content_text`, string (description of event)

### Example event in JSON:

`{
  "start_date":"1775",
  "end_date":"1783",
  "content_text":"American Revolutionary War: an armed struggle for secession from the British Empire by the Thirteen Colonies that would subsequently become the United States.",
  "facet":"North America",
  "category":"North America"
},`

### Example event in CSV:

header row:

`start_date,end_date,content_text,facet,category`

example event row:

`1775,1783,American Revolutionary War: an armed struggle for secession from the British Empire by the Thirteen Colonies that would subsequently become the United States.,North America,North America`

## Demo dataset provenance

- authors.json, [Modern Library Authors](http://www.brainpickings.org/2013/11/29/accurat-modern-library/), manual reproduction of infographic
- ch-jp-ko.json, [East Asian Dynasties](http://bl.ocks.org/bunkat/2338034), data included in bl.ocks code snippet
- dailyroutines.json / dailyroutines.csv, [The Daily Routines of Famous Creative People](https://podio.com/site/creative-routines), manual reproduction of infographic
- empires.json, [History's Largest Empires](http://nowherenearithaca.github.io/empires/index.html), scraped using D3 deconstructor
- epidemics.json, [Epidemics since the 14th Century](https://en.wikipedia.org/wiki/List_of_epidemics), generated using TimeLineCurator
- france-presidents.json, [Presidents of France](http://www.downloadexcelfiles.com/fr_en/download-excel-file-list-presidents-france), filtered and formatted into json
- germany-chancellors.json, [Chancellors of Germany](https://en.wikipedia.org/wiki/List_of_Chancellors_of_Germany), generated manually
- heads-of-state.json, G7 Heads of State, (combination of US, Canada, UK, Japan, France, Italy, Germany datasets)
- heads-of-state-since-1940.json, G7 Heads of State since 1940, (combination of US, Canada, UK, Japan, France, Italy, Germany datasets)
- hurricanes10y.json, [C4-5 Hurricanes: 2001-2010](http://www.aoml.noaa.gov/hrd/hurdat/easyread-2011.html), filtered and formatted into json
- hurricanes50y.json, [C4-5 Hurricanes: 1960-2010](http://www.aoml.noaa.gov/hrd/hurdat/easyread-2011.html), filtered and formatted into json
- hurricanes100y.json, [C4-5 Hurricanes: 1910-2010](http://www.aoml.noaa.gov/hrd/hurdat/easyread-2011.html), filtered and formatted into json
- italy-presidents.json, [Presidents of Italy](http://www.downloadexcelfiles.com/it_en/download-excel-file-list-presidents-italy), filtered and formatted into json
- japan-prime-ministers.json, [Prime Ministers of Japan](http://www.downloadexcelfiles.com/jp_en/download-excel-file-list-prime-ministers-japan), filtered and formatted into json
- painters.json, [Great Painters of the 20th Century](http://www.brainpickings.org/2013/06/07/painters-lives-accurat-giorgia-lupi/), manual reproduction of infographic
- perspective-on-time.json, [visual.ly's Perspective on Time](http://visual.ly/perspective-time), manual reproduction of infographic
- philosophers.json, [Great Philosophers since the 8th Century BC](http://bl.ocks.org/rengel-de/5603464), data included in bl.ocks code snippet
- presidents.json, [Presidents of the USA](https://raw.githubusercontent.com/hitch17/sample-data/master/presidents.json), filtered
- priestley.json / priestley.csv, [Priestley's Chart of Biography](https://upload.wikimedia.org/wikipedia/commons/9/98/PriestleyChart.gif), manual reproduction of infographic
- prime-ministers.json, [Prime Ministers of Canada](http://www.downloadexcelfiles.com/ca_en/download-excel-file-list-prime-ministers-canada), filtered and formatted into json
- singularity.json, [Kurzweil's Countdown to Singularity](http://www.singularity.com/images/charts/CountdowntoSingularityLog.jpg), manual reproduction of infographic
- typical-american.json, [Life of a Typical American](http://waitbutwhy.com/2014/05/life-weeks.html), manual reproduction of infographic
- uk-prime-ministers.json, [Prime Ministers of the UK](http://www.downloadexcelfiles.com/gb_en/download-excel-file-list-prime-ministers-uk), filtered and formatted into json

## OSS Libraries / scripts used in this project

- [d3 v3.5.5](http://d3js.org/) for visual encoding, scales, animation (BSD LICENSE)
- [d3-time v0.0.2](https://github.com/d3/d3-time) for date parsing / temporal arithmetic ([LICENSE](https://github.com/d3/d3-time/blob/master/LICENSE))
- [moment.js v2.10.6](http://momentjs.com/) for date parsing / temporal arithmetic (MIT LICENSE)
- [saveSvgAsPng.js](https://github.com/exupero/saveSvgAsPng) for image export (MIT LICENSE)
- [intro.js 2.3.0](http://usablica.github.com/intro.js/) for tutorial (GNU AGPLv3 LICENSE)
- [gif.js](https://github.com/jnordberg/gif.js) for GIF exporting (MIT LICENSE)
- [gsheets 2.0.0](https://github.com/interactivethings/gsheets) for Google Spreadsheet import (BSD LICENSE)

## Noun Project icons used in the user interface

All Icons [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/us/), by name and author:

- [check-mark](https://thenounproject.com/term/check-mark/608852) (Arthur Shlain)
- [calendar](https://thenounproject.com/term/calendar/38869) (Kiril) Tomilov)
- [timeline](https://thenounproject.com/term/timeline/152347) (Alecander) Bickov)
- [gif-file](https://thenounproject.com/term/gif-file/446903) (Pranav Grover)
- [png-file](https://thenounproject.com/term/png-file/446907) (Pranav Grover)
- [svg-file](https://thenounproject.com/term/svg-file/446904) (Pranav Grover)
- [json-file](https://thenounproject.com/term/json-file/446959) (Pranav Grover)
- [csv-file](https://thenounproject.com/term/csv-file/446962) (Pranav Grover)
- [drive](https://thenounproject.com/term/drive/128372) (Denis Klyuchnikov)
- [grid](https://thenounproject.com/term/grid/539919) (Doejo)
- [folder](https://thenounproject.com/term/folder/43216) (iconoci)
- [filter](https://thenounproject.com/term/filter/132317) (Creative) Shell)
- [image](https://thenounproject.com/term/image/332296) (Creative) Shell)
- [quotation-mark](https://thenounproject.com/term/quotation-mark/378366) (Veronika Krpciarova)
