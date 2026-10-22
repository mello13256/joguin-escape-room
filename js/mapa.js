// Mapa do depósito. Cada caractere é uma célula de 2x2 metros.
//  #  parede              .  chão                 D  porta interna (abre sozinha)
//  E  porta de saída      C  lugar possível p/ PC L  lâmpada no teto
//  x  pilha de caixotes   S  prateleira           P  início do jogador
//  M  início da criatura  o  pátio (lado de fora) F  cerca
//  K  carro de fuga       B  mancha de sangue
window.MAPA = [
  '#####################################',
  '#.C...#.......#....P....#..C..#.....#',
  '#.....#..xx...#..SS.SS..#.....#..B..#',
  '#..L..D...L...#....L....D..L..D..L..#',
  '#.....#......C#..SS.SS..#.....#....C#',
  '###D#####D#####.........#######D#####',
  '#.......#.....D....B....D.....#.....#',
  '#...L...#..L..#..SS.SS..#..L..#..L..#',
  '#C......#....C#.........#.....#.....#',
  '#xx.....###D###..SS.SS..###D###.....#',
  '#x......D...........................#',
  '#.......#...L.....L.....L.....L.....#',
  '#...B...#..............B............#',
  '###D#####..xx....xx....xx....xx..#D##',
  '#.......#..xx....xx....xx....xx..#..#',
  '#...L...D.......................C#..#',
  '#......C#....L.............L.....#L.#',
  '###D#######D#######D#######D######D##',
  '#......#.......#.......#.......#....#',
  '#..L...D...L...#...L...D...L...D..L.#',
  '#......#......C#C......#..M....#....#',
  '#..B...#.......#.......#...xx..#....#',
  '#E################################E##',
  'FoooooooooooooooooooooooooooooooooooF',
  'FoooooooooooooooooooooooooooooooooooF',
  'FoooooooooooooooooKoooooooooooooooooF',
  'FoooooooooooooooooooooooooooooooooooF',
  'FoooooooooooooooooooooooooooooooooooF',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
];
