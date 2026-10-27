# Líderes Exclusivos · Dropi — guía de assets

Abre `index.html` (mejor con un servidor local, p. ej. `npx serve` o Live Server).

## Dónde va cada imagen
Las rutas sin extensión prueban `.png`, `.webp`, `.jpg` y `.svg`. Si un archivo no existe,
se muestra el respaldo vectorial, así que puedes ir agregándolos de a uno.

| Qué | Ruta |
|---|---|
| Video scroll PNG (Drive 17sdd…) | `assets/frames/scroll/0001.png`, `0002.png`… (se cuentan solos) |
| Medallones de líderes (Drive 1Bdvb…) | `assets/img/insignias/maestro`, `elite`, `leyenda-lider` |
| Insignias de Leyendas (Drive 1Qrf…) | `assets/img/insignias/estrella`, `rockstar`, `icono`, `gran-forjador` |
| Placa Forjador (ya incluida) | `assets/img/insignias/forjador.webp` · `assets/img/forjador.webp` |
| Insignias detrás del 1.000 final (Drive 1yKK…) | `assets/img/cierre/01` … `14` |
| Logo Leyendas (Drive 1YlX…) | `assets/img/logo-leyendas.png` |
| Fondo "Tú, mejor líder" y WEBE | se carga desde Drive (IMG-lider-1) si es público; si no, `assets/img/lider.jpg` / `webe.jpg` |
| Fondos genéricos | `assets/img/ruta.jpg`, `gala.jpg` (reemplázalos con el mismo nombre) |
| Tarjeta DropiPay | `assets/img/dropipay-card.webp` |

Las rutas de las fotos se cambian en el atributo `data-srcs` del HTML (separa alternativas con `|`).

## Video scroll
Si tus frames se llaman distinto (ej. `Comp 1_00000.png`), en `js/main.js` → `CONFIG.sequences.scroll`
ajusta `prefix: 'Comp 1_'`, `start: 0`, `pad: 5`. Hoy se reproduce en la apertura mientras el 1.000 se
desintegra. Para moverlo, cambia `data-seq="scroll"` al `<canvas class="seq">` de otra escena.

## Ajustes rápidos (js/main.js → CONFIG)
- `sectionMs`: duración del cambio de escena (1500 ms).
- `wheelGap`: sensibilidad de la rueda/trackpad.
- `ring`: lista de insignias del cierre.
- `starkDate`: fecha del conteo del Proyecto Stark.
