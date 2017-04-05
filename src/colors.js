var colorSchemes;

(function (colorSchemes) {

  "use strict";

  colorSchemes.schema1 = function () {
    return [
      '#775566',
      '#6688bb',
      '#556677',
      '#88aa88',
      '#88bb33',
      '#cc7744',
      '#003366',
      '#994422',
      '#331111'
    ];
  }

  colorSchemes.schema2 = function () {
    return [
      '#44b3c2',
      '#f1a94e',
      '#e45641',
      '#5d4c46',
      '#7b8d8e',
      '#2ca02c',
      '#003366',
      '#9467bd',
      '#bcbd22',
      '#e377c2'
    ];
  }

  colorSchemes.schema3 = function () {
    return [
      '#001166',
      '#0055aa',
      '#1199cc',
      '#99ccdd',
      '#002222',
      '#ddffff',
      '#446655',
      '#779988',
      '#115522'
    ];
  }

  colorSchemes.schema4 = function () {
    return [
      '#1f77b4',
      '#ff7f0e',
      '#2ca02c',
      '#d62728',
      '#9467bd',
      '#8c564b',
      '#e377c2',
      '#7f7f7f',
      '#bcbd22',
      '#17becf'
    ];
  }

  colorSchemes.schema5 = function () {
    return [
      '#1f77b4',
      '#aec7e8',
      '#ff7f0e',
      '#ffbb78',
      '#2ca02c',
      '#98df8a',
      '#d62728',
      '#ff9896',
      '#9467bd',
      '#c5b0d5',
      '#8c564b',
      '#c49c94',
      '#e377c2',
      '#f7b6d2',
      '#7f7f7f',
      '#c7c7c7',
      '#bcbd22',
      '#dbdb8d',
      '#17becf',
      '#9edae5'
    ];
  }

  //colorbrewer categorical 12
  colorSchemes.schema6 = function () {
    return [
      '#a6cee3',
      '#1f78b4',
      '#b2df8a',
      '#33a02c',
      '#fb9a99',
      '#e31a1c',
      '#fdbf6f',
      '#ff7f00',
      '#cab2d6',
      '#6a3d9a',
      '#ffff99',
      '#b15928'
    ];
  }

})(colorSchemes || (colorSchemes = {}));

module.exports = colorSchemes;