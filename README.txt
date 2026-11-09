ENTREGA DE ACTIVIDADES - FABIAN

1. Estructura HTML:
   Se organizaron las secciones de visualización 3D y dashboard.
   Se conservaron los identificadores de los canvas para futuras integraciones.

2. Estilos CSS:
   Se agregó estilos.css con dimensiones para el canvas 3D y las gráficas.
   El diseño se adapta a pantallas pequeñas.

3. Chart.js:
   Chart.js se declara como dependencia en package.json.
   Para instalar las dependencias, ejecutar:
       npm install
   Para comprobar Chart.js:
       npm list chart.js
   Para iniciar el proyecto:
       npm run dev

4. Dashboard:
   Se prepararon dos contenedores de gráficas:
   - Separación de materiales.
   - Telemetría del proceso.

5. Configuración inicial de Chart.js:
   src/main.js crea una gráfica doughnut y una gráfica line usando datos de ejemplo.
   Ambas usan responsive: true y maintainAspectRatio: false.

NOTA:
Los datos son simulados. El canvas renderCanvas solo está preparado visualmente;
todavía falta conectar una librería 3D y cargar el modelo/escena de la maquinaria.
