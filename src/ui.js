var MAX_LINE_SIZE = 110;
var colors = require('colors');

function chunkString(str, len) {
  var _size = Math.ceil(str.length/len),
      _ret  = new Array(_size),
      _offset
  ;

  for (var _i=0; _i<_size; _i++) {
    _offset = _i * len;
    _ret[_i] = str.substring(_offset, _offset + len);
  }

  return _ret;
}


exports.createFullWidthLine = function (char, position) {
    var content, cols;

    char = char || '-';
    position = position || 'middle';
    cols = (process.stdout.columns > MAX_LINE_SIZE) ? MAX_LINE_SIZE : process.stdout.columns;

    content = char.repeat(cols - 2);

    switch (position) {
        case 'top':
            return '┌' + content + '┐';
        case 'middle':
            return '├' + content + '┤';
        case 'bottom':
            return '└' + content + '┘';
    }
}

exports.drawBoxEdges = function (line, color) {
    var cols = (process.stdout.columns > MAX_LINE_SIZE) ? MAX_LINE_SIZE : process.stdout.columns,
        maxLineSize = cols - 4,
        __color = (typeof color === 'string') ? color : 'green';

    // if (line.length > maxLineSize) {
    //     line = chunkString(line, maxLineSize);
    //     return line.map(function (curline) {
    //         return exports.drawBoxEdges(curline, __color);
    //     }).join('\n');
    // }

    var linewithspaces = (line + ' '.repeat(maxLineSize + 1 - line.length));
    var colorRender = colors[__color];

    return [
        ('│ '.green),
        colorRender(linewithspaces),
        ('│'.green)
    ].join('');
}