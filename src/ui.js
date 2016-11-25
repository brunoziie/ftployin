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
    var content;

    char = char || '-';
    position = position || 'middle';
    content = char.repeat(process.stdout.columns - 2);

    switch (position) {
        case 'top':
            return '┌' + content + '┐';
        case 'middle':
            return '├' + content + '┤';
        case 'bottom':
            return '└' + content + '┘';
    }
}

exports.drawBoxEdges = function (line) {
    var maxLineSize = process.stdout.columns - 4;

    if (line.length > maxLineSize) {
        line = chunkString(line, maxLineSize);
        return line.map(exports.drawBoxEdges).join('\n');
    }


    return '│ ' + line + ' '.repeat(maxLineSize + 1 - line.length) + '│';
}