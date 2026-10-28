/* The cast block: the button at the bottom of a page that casts, in the
   volley's look, and the row that holds it.

   A page asks for the row, puts it last in its page, and keeps its own
   handler on the button it asked for. The look is the shell's, because two
   pages paint it: the volley casts a spell and the attack page casts a
   weapon strike, and Mandal's rule is one cast button in one place, at the
   bottom of the page where the volley puts it. */
(function (root) {
  'use strict';

  root.SheetCast = function () {
    /* One button. A quick one is the second cast of the volley, the same
       block in another colour. The names carry the block, so they cannot be
       taken by a page: the sheet already has a cast action of its own. */
    function button(opts) {
      var o = opts || {};
      var quick = o.quick ? ' castbtn-quick' : '';
      return '<button class="castbtn' + quick + '"' +
        (o.id ? ' id="' + o.id + '"' : '') +
        (o.hidden ? ' hidden' : '') +
        (o.disabled ? ' disabled' : '') +
        ' type="button"><span>' + (o.label || 'Cast') + '</span></button>';
    }

    /* The row a page puts at the bottom: one button, or the volley's two. */
    function row(opts) {
      var o = opts || {};
      var list = o.buttons || [o];
      return '<div class="castbar">' + list.map(button).join('') + '</div>';
    }

    return { button: button, row: row };
  };
})(typeof window !== 'undefined' ? window : this);
