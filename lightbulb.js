var lightOn
window.onload = function(){
  let please = new Promise(function(yuh, nau){
    if(localStorage.getItem != null)
    {
      if(localStorage.getItem("lightmode") == "dark")
      {lightOn = false;}
      else
      {lightOn = true;}
    }
    else
    {lightOn = false}

    yuh("OK")
  });
  please.then(
    function(values) {applyMode();},
    function(error) {console.log("darn");}
  );
}

function changeModes()
{
  let please = new Promise(function(yuh, nau){
    if(lightOn)
      {
        localStorage.setItem("lightmode", "dark");
        lightOn = false;
      }
    else
      {
        localStorage.setItem("lightmode", "undark");
        lightOn = true;
      }
  });
  please.then(
    applyMode()
  );
}

function applyMode()
{
  if(lightOn)
  {
    var count = document.getElementsByClassName("darkmode").length;
    for(i = 0; i < count; i++)
    {
      var body = document.getElementsByClassName("darkmode")[0];
      body.classList.remove("darkmode");
      body.classList.add("lightmode");
    }
  }
  else
  {
    var count = document.getElementsByClassName("lightmode").length;
    for(i = 0; i < count; i++)
    {
      var body = document.getElementsByClassName("lightmode")[0];
      body.classList.remove("lightmode");
      body.classList.add("darkmode");
    }
  }
}
