# Gecko in.touch2

Controle desde Gladys un spa equipado con un controlador Gecko y su módulo
Wi-Fi **in.touch2**: temperatura del agua, consigna, bombas, soplador,
cascada, luces y modo de cuidado del agua.

La integración se comunica **directamente con el módulo in.touch2 en su red
local** (puerto UDP 10022), como hace la aplicación oficial in.touch2 en
casa. Sin cuenta en la nube ni contraseña: el spa sigue funcionando con
Gladys aunque no haya internet.

## Requisitos

- Un spa con un controlador Gecko (in.YT, in.XE, in.YJ, in.XM, in.YE…) y su
  módulo in.touch2, ya emparejado y funcionando con la aplicación in.touch2.
- El módulo in.touch2 (la caja conectada cerca de su router) en la misma red
  local que Gladys.
- Gladys 5.1 o posterior.

## Puesta en marcha

1. Instale la integración y abra su pestaña **Descubrimiento**: los módulos
   in.touch2 de la red responden en pocos segundos. Añada su spa.
2. ¿No aparece? Asigne una dirección fija al módulo in.touch2 en su router
   (reserva DHCP), escríbala en **Dirección del módulo in.touch2** en la
   pestaña **Configuración**, guarde y vuelva a abrir la pestaña
   Descubrimiento.
3. **Buscar spas** (pestaña Configuración) realiza la misma búsqueda e indica
   qué ha respondido; **Probar la conexión** comprueba cada spa conocido y
   muestra la señal de radio entre el módulo y el spa.

## Qué obtiene

Un dispositivo por spa, cuyas funciones dependen de lo que esté conectado a
su controlador:

| Función                 | Descripción                                                    |
| ----------------------- | -------------------------------------------------------------- |
| Temperatura del agua    | Medida por el spa (°C, convertida por Gladys si usa °F)        |
| Temperatura de consigna | Ajustable dentro del rango de su spa (15–40 °C)                |
| Calefacción             | Si el calentador está funcionando                              |
| Bomba 1…5               | Encendido/apagado (encendido = velocidad alta)                 |
| Soplador, cascada       | Encendido/apagado                                              |
| Luz, luz 2              | Encendido/apagado                                              |
| Bomba de circulación    | Solo lectura                                                   |
| Ozono                   | Solo lectura                                                   |
| Modo de cuidado         | Fuera de casa, Estándar, Ahorro, Súper ahorro, Fin de semana   |
| Señal de radio          | Calidad del enlace de radio entre el módulo in.touch2 y el spa |

El spa envía los valores en cuanto cambian: sin sondeo periódico.

## Escenas

Disparadores:

- **Agua del spa a temperatura** — el agua ha alcanzado la consigna. Las
  acciones siguientes pueden leer `{{triggerEvent.data.temperature}}`.
- **Calefacción del spa iniciada o detenida** — filtre por iniciada y/o
  detenida.
- **Conexión con el spa perdida o recuperada** — el módulo in.touch2 ha
  dejado de responder o vuelve a responder.

Acciones:

- **Ajustar la temperatura del spa** — devuelve la temperatura realmente
  aplicada.
- **Ajustar el modo de cuidado**.
- **Controlar una bomba o una luz** — apagado, velocidad baja o alta. Indica
  si el spa tiene ese equipo.
- **Detener los chorros y luces del spa** — devuelve cuántos equipos estaban
  en marcha.

## Panel

El widget **Resumen del spa** muestra la temperatura del agua y la consigna
(en directo), la calefacción, el modo de cuidado y la conexión, con botones
para encender/apagar la luz, cambiar la temperatura y detenerlo todo. Con
varios spas, elija uno en los ajustes del widget.

## Solución de problemas

- **No se encuentra nada** — el módulo responde a las difusiones en el puerto
  UDP 10022. Algunos routers o sistemas mesh las filtran: escriba la
  dirección del módulo en la configuración. Compruebe que la aplicación
  oficial funciona en la misma Wi-Fi.
- **Inaccesible** — el módulo ya no responde (alimentación, Wi-Fi). La
  integración lo reintenta cada minuto.
- **Punto naranja en la insignia** — el módulo responde pero su enlace de
  radio con el spa es inestable: acerque el módulo al spa.
- **Controlador no compatible** — los registros indican la plataforma y las
  versiones del mapa de memoria: abra una incidencia en la página del
  proyecto con esos datos.

En algunas versiones de firmware solo una aplicación puede controlar el spa
a la vez: si la aplicación oficial pierde la conexión mientras Gladys está
conectado, es normal.
