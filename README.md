# Timeline Storyteller

!["The Daily Routines of Famous Creative People": A Story made with Timeline Storyteller](https://github.com/Microsoft/timelinestoryteller/blob/master/public/img/dailyroutines.gif "'The Daily Routines of Famous Creative People': A Story made with Timeline Storyteller")

[Timeline Storyteller](https://timelinestoryteller.com/) is an expressive browser-based visual storytelling environment for presenting timelines.

You can use Timeline Storyteller to present different aspects of your data using a palette of timeline representations, scales, and layouts, as well as controls for filtering, highlighting, and annotation. You can export images of a timeline or assemble and record a story about your data and present it within the application.

![Timeline Design dimensions](https://github.com/Microsoft/timelinestoryteller/blob/master/public/img/dims.png "Timeline Design dimensions")

To learn more about the research that informed this project, see [timelinesrevisited.github.io](https://timelinesrevisited.github.io/), which includes a survey of timeline tools and more than 200 bespoke timelines.

See [these examples](https://timelinestoryteller.com/#examples) of timelines and timeline stories made with Timeline Storyteller.

## Project Team

- [Matthew Brehmer](http://mattbrehmer.github.io/)
- [Bonghsin Lee](http://research.microsoft.com/en-us/um/people/bongshin/)
- [Nathalie Henry Riche](http://research.microsoft.com/en-us/um/people/nath/)
- [Darren Edge](https://www.microsoft.com/en-us/research/people/daedge/)
- [Christopher White](https://www.microsoft.com/en-us/research/people/chwh/)
- [Kate Lytvynets](mailto:kalytv@microsoft.com)
- [David Tittsworth](mailto:David.Tittsworth@microsoft.com)

## Setup / Testing

1. Clone the main branch of this repository: `git clone https://github.com/Microsoft/timelinestoryteller.git`

2. Ensure that [nodejs](https://nodejs.org/), [npm](https://www.npmjs.com/), and [yarn](https://yarnpkg.com/en/) are installed.

3. Open a terminal at the root of the repository and install node modules: `yarn` OR `npm_install`.

4. Build public/app/timelinestoryteller.js: `npm test`

5. Start the node server: `npm start`

6. Open [localhost:8000](http://localhost:8000/)

The application source code can be found in the [src/](https://github.com/Microsoft/timelinestoryteller/tree/master/src) directory.

## Preparing your data

Timeline Storyteller currently supports datasets of events in CSV, JSON, or Google Spreadsheet format.

Each event is specified by the following attributes:

- __Required__: `start_date`, date: YYYY, YYYY-MM-DD, or YYYY-MM-DD HH:MMZ (ISO 8601) formats are supported (Z necessary for specifying UTC, otherwise HH:MM will be time-zone dependent). BC dates are permitted, e.g., -27, -13800000000
- __Optional__: `end_date`, date: using same format as `start_date`
- __Optional__: `category`, a string corresponding to the category of the event (which Timeline Storyteller encodes as colour)
- __Optional__: `facet`,a string corresponding to another category of the event (which Timeline Storyteller uses to create a faceted timeline layout; `category` and `facet` can be identical if desired)
- __Optional__: `content_text`, a string description of the event (which Timeline Storyteller exposes as event annotations)

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

### Example CSV / Google Spreadsheet

Here is the [The Daily Routines of Famous Creative People](https://podio.com/site/creative-routines) demo dataset used in Timeline Storyteller's demo in a [Google Sheet](https://docs.google.com/spreadsheets/d/1x8N7Z9RUrA9Jmc38Rvw1VkHslp8rgV2Ws3h_5iM-I8M/pubhtml).

- Ensure that the spreadsheet is published (open the Google Spreadsheet 'File' menu, select 'Publish to the Web').
- Ensure that `start_date` and `end_date` columns are formatted as text and not as dates (e.g., `'1926-06-29`).
- __Required__: Spreadsheet URL
- __Optional__: Worksheet title (i.e., tab name) for this dataset: `dailyroutines`
- Enter the spreadsheet URL and worksheet title into Timeline Storyteller's load dialog.

## Usage

Note that more detailed usage instructions are available at [timelinestoryteller.com](https://timelinestoryteller.com/)

1. Load timeline data (demo dataset, JSON, CSV, Google Spreadsheet) or saved timeline story (a JSON Blob with extension .cdc; see step 6)

2. Select a combination of representation, scale, and layout from the menu at the top of the screen; only some combinations are valid; see [our guidance on selecting appropriate combinations for your story](http://timelinesrevisited.github.io/supplemental/gallery/). Mouseover these options to view a tooltip that describes how they might be useful.

3. Edit the canvas

	* Click on events to annotate with their `content_text` label; resize and reposition labels; SHIFT + click to highlight events without showing label.

	* Annotate with captions and images; resize and reposition captions and images.

 	* Filter events by category, facet, or segment. Filter by highlighting emphasizing matching events (de-emphasizing non-matching events).

	* You can also filter by hiding non-matching events.

4. Record current canvas as a scene, which retains labels, captions, and images. Enter playback mode, navigate to previous / next recorded scene.

5. Export current canvas as a PNG, SVG.

6. Export the scenes as an animated GIF or as a JSON Blob (.cdc extension).

## License

Timeline Storyteller

Copyright (c) Microsoft Corporation

All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the Software), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Acknowledgements

### Citing us

If you use Timeline Storyteller to make a timeline for a research paper, you can cite us in two ways. You can cite the tool itself:

`@misc{TimelineStoryteller,
author = {Matthew Brehmer and Bongshin Lee and Nathalie Henry Riche and Darren Edge and Christopher White and Kate Lytvynets and David Tittsworth},
title = {Microsoft Timeline Storyteller},
year = {2017},
note = {\url{https://timelinestoryteller.com}}
}`

Or you can cite our recent journal paper about the timeline design space:

`@article{Brehmer2016,
author = {Matthew Brehmer and Bongshin Lee and Benjamin Bach and Nathalie Henry Riche and Tamara Munzner},
title = {Timelines Revisited: A Design Space and Considerations for Expressive Storytelling},
journal = {IEEE Transactions on Visualization and Computer Graphics (TVCG)},
year = {2017},
volume = {23},
issue = {9},
pages = {2151--2164},
doi = {10.1109/TVCG.2016.2614803},
ISSN = {1077-2626}
}`

### Demo dataset provenance

- [Priestley's Chart of Biography](https://upload.wikimedia.org/wikipedia/commons/9/98/PriestleyChart.gif)
- [Great Philosophers since the 8th Century BC](http://bl.ocks.org/rengel-de/5603464)
- [History's Largest Empires](http://nowherenearithaca.github.io/empires/index.html)
- [East Asian Dynasties](http://bl.ocks.org/bunkat/2338034)
- [Epidemics since the 14th Century](https://en.wikipedia.org/wiki/List_of_epidemics)
- [Prime Ministers of Canada](http://www.downloadexcelfiles.com/ca_en/download-excel-file-list-prime-ministers-canada)
- [Presidents of France](http://www.downloadexcelfiles.com/fr_en/download-excel-file-list-presidents-france)
- [Chancellors of Germany](https://en.wikipedia.org/wiki/List_of_Chancellors_of_Germany)
- [Presidents of Italy](http://www.downloadexcelfiles.com/it_en/download-excel-file-list-presidents-italy)
- [Prime Ministers of Japan](http://www.downloadexcelfiles.com/jp_en/download-excel-file-list-prime-ministers-japan)
- [Prime Ministers of the UK](http://www.downloadexcelfiles.com/gb_en/download-excel-file-list-prime-ministers-uk)
- [Presidents of the USA](https://raw.githubusercontent.com/hitch17/sample-data/master/presidents.json)
- [C4-5 Hurricanes: 1960-2010](http://www.aoml.noaa.gov/hrd/hurdat/easyread-2011.html)
- [The Daily Routines of Famous Creative People](https://podio.com/site/creative-routines)
-['Visualizing painters' lives" by Accurat](http://www.brainpickings.org/2013/06/07/painters-lives-accurat-giorgia-lupi/)
- ['From first published to masterpieces' by Accurat](http://www.brainpickings.org/2013/11/29/accurat-modern-library/)
- [Kurzweil's 'Countdown to Singularity'](http://www.singularity.com/images/charts/CountdowntoSingularityLog.jpg)
- ['A Perspective on Time' by mayra.artes for Wait But Why](http://visual.ly/perspective-time)
- ['Life of a Typical American' by Tim Urban for Wait But Why](http://waitbutwhy.com/2014/05/life-weeks.html)

### Noun Project icons used in the user interface

All Icons [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/us/), by name and author:

- [check-mark](https://thenounproject.com/term/check-mark/608852) (Arthur Shlain)
- [calendar](https://thenounproject.com/term/calendar/38869) (Kiril Tomilov)
- [timeline](https://thenounproject.com/term/timeline/152347) (Alecander Bickov)
- [gif-file](https://thenounproject.com/term/gif-file/446903) (Pranav Grover)
- [png-file](https://thenounproject.com/term/png-file/446907) (Pranav Grover)
- [svg-file](https://thenounproject.com/term/svg-file/446904) (Pranav Grover)
- [json-file](https://thenounproject.com/term/json-file/446959) (Pranav Grover)
- [csv-file](https://thenounproject.com/term/csv-file/446962) (Pranav Grover)
- [drive](https://thenounproject.com/term/drive/128372) (Denis Klyuchnikov)
- [grid](https://thenounproject.com/term/grid/539919) (Doejo)
- [folder](https://thenounproject.com/term/folder/43216) (iconoci)
- [filter](https://thenounproject.com/term/filter/132317) (Creative Shell)
- [image](https://thenounproject.com/term/image/332296) (Creative Shell)
- [quotation-mark](https://thenounproject.com/term/quotation-mark/378366) (Veronika Krpciarova)
- [pin](https://thenounproject.com/term/pin/172903) (Alexandr Cherkinsky)
- [eraser](https://thenounproject.com/term/eraser/3715) (Terrence Kevin Oleary)
- [invisible](https://thenounproject.com/term/invisible/506290) (Kid A)
- [book](https://thenounproject.com/term/book/861149) (Setyo Ari Wibowo)
