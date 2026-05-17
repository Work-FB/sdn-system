const buttons = document.querySelectorAll('.menu-btn');

buttons.forEach(button => {

    button.addEventListener('click', () => {

        buttons.forEach(btn => {
            btn.classList.remove('active');
        });

        button.classList.add('active');

    });

});

const usuario =
JSON.parse(
    localStorage.getItem("usuario")
);

document.querySelector(
    ".user-box span"
).innerText =
usuario.nombre;